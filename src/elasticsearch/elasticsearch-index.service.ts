import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { errors } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchIndexService {
  private readonly logger = new Logger(ElasticsearchIndexService.name);

  constructor(private readonly esService: ElasticsearchService) {}

  async ensureIndex(indexName: string, aliasName?: string): Promise<void> {
    const exists = await this.esService.indices.exists({ index: indexName });

    if (!exists) {
      this.logger.log(`Creating index "${indexName}" with dynamic templates`);

      // Dynamic templates keep indexing schema-agnostic: new JSON-LD properties
      // are automatically mapped without code changes.
      await this.esService.indices.create({
        index: indexName,
        mappings: {
          dynamic_templates: [
            {
              strings_as_text_and_keyword: {
                match_mapping_type: 'string',
                mapping: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword', ignore_above: 512 },
                  },
                },
              },
            },
            {
              objects_as_nested: {
                match_mapping_type: 'object',
                mapping: { type: 'nested' },
              },
            },
          ],
        },
      });
    }

    if (aliasName) {
      await this.ensureAlias(indexName, aliasName);
    }
  }

  private async ensureAlias(
    indexName: string,
    aliasName: string,
  ): Promise<void> {
    try {
      const aliasResponse = await this.esService.indices.getAlias({
        name: aliasName,
      });
      const pointsToThisIndex = indexName in aliasResponse;

      if (!pointsToThisIndex) {
        this.logger.warn(
          `Alias "${aliasName}" already exists but does not point to "${indexName}". Use swapAlias to update it.`,
        );
      }
    } catch (error) {
      if (error instanceof errors.ResponseError && error.statusCode === 404) {
        await this.esService.indices.putAlias({
          index: indexName,
          name: aliasName,
        });
        this.logger.log(
          `Created alias "${aliasName}" pointing to "${indexName}"`,
        );
        return;
      }
      throw error;
    }
  }

  async bulkIndex(
    indexName: string,
    documents: Record<string, unknown>[],
  ): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    // ES bulk API expects alternating action/document pairs: [action, doc, action, doc, ...]
    const operations = documents.flatMap((doc) => {
      const id = doc['@id'] as string;
      return [{ index: { _index: indexName, _id: id } }, doc];
    });

    const response = await this.esService.bulk({ operations });

    if (response.errors) {
      const errorItems = response.items.filter((item) => item.index?.error);
      this.logger.warn(
        `Bulk indexing encountered ${errorItems.length} errors (${documents.length - errorItems.length} succeeded)`,
      );
      for (const item of errorItems) {
        this.logger.warn(
          `Failed to index document ${item.index?._id}: ${JSON.stringify(item.index?.error)}`,
        );
      }
    }

    const successCount = response.items.filter(
      (item) => !item.index?.error,
    ).length;
    this.logger.log(`Indexed ${successCount} documents into "${indexName}"`);
  }

  async bulkDelete(indexName: string, documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) {
      return;
    }

    const operations = documentIds.flatMap((id) => [
      { delete: { _index: indexName, _id: id } },
    ]);

    const response = await this.esService.bulk({ operations });

    if (response.errors) {
      const errorItems = response.items.filter((item) => item.delete?.error);
      this.logger.warn(
        `Bulk deletion encountered ${errorItems.length} errors in "${indexName}"`,
      );
      for (const item of errorItems) {
        this.logger.warn(
          `Failed to delete document ${item.delete?._id}: ${JSON.stringify(item.delete?.error)}`,
        );
      }
    }

    this.logger.log(
      `Deleted ${documentIds.length} documents from "${indexName}"`,
    );
  }

  async swapAlias(aliasName: string, newIndexName: string): Promise<void> {
    let oldIndices: string[] = [];

    try {
      const aliasResponse = await this.esService.indices.getAlias({
        name: aliasName,
      });
      oldIndices = Object.keys(aliasResponse);
    } catch (error) {
      if (
        !(error instanceof errors.ResponseError && error.statusCode === 404)
      ) {
        throw error;
      }
    }

    const actions: Array<
      | { remove: { index: string; alias: string } }
      | { add: { index: string; alias: string } }
    > = [];

    for (const oldIndex of oldIndices) {
      actions.push({ remove: { index: oldIndex, alias: aliasName } });
    }
    actions.push({ add: { index: newIndexName, alias: aliasName } });

    await this.esService.indices.updateAliases({ actions });

    if (oldIndices.length > 0) {
      this.logger.log(
        `Swapped alias "${aliasName}" from [${oldIndices.join(', ')}] to "${newIndexName}"`,
      );
    } else {
      this.logger.log(
        `Created alias "${aliasName}" pointing to "${newIndexName}"`,
      );
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    await this.esService.indices.delete({ index: indexName });
    this.logger.log(`Deleted index "${indexName}"`);
  }

  // Removes indices left behind by interrupted reindexes. An index is deleted
  // only when it carries the alias prefix with a numeric suffix (so a
  // hand-created index sharing the prefix is never touched), holds no alias,
  // and is not explicitly kept. Best-effort by design: a cleanup failure must
  // not fail an otherwise successful reindex.
  async pruneStaleIndices(alias: string, keep: string[]): Promise<void> {
    const keepSet = new Set(keep);
    const namePattern = new RegExp(`^${alias}-\\d+$`);

    let indices: Record<string, { aliases?: Record<string, unknown> }>;
    try {
      indices = (await this.esService.indices.get({
        index: `${alias}-*`,
      })) as Record<string, { aliases?: Record<string, unknown> }>;
    } catch (error) {
      this.logger.warn(`Failed to list indices for pruning: ${error}`);
      return;
    }

    const stale = Object.entries(indices)
      .filter(([name, info]) => {
        if (keepSet.has(name)) return false;
        if (!namePattern.test(name)) return false;
        return Object.keys(info.aliases ?? {}).length === 0;
      })
      .map(([name]) => name);

    let pruned = 0;
    for (const name of stale) {
      try {
        await this.esService.indices.delete({ index: name });
        this.logger.log(`Pruned stale index "${name}"`);
        pruned += 1;
      } catch (error) {
        this.logger.warn(`Failed to prune stale index "${name}": ${error}`);
      }
    }

    if (stale.length > 0) {
      this.logger.log(
        `Pruned ${pruned} of ${stale.length} stale indices for "${alias}"`,
      );
    }
  }
}
