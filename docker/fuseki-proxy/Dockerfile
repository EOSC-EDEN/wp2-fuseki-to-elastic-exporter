FROM node:22-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY proxy.mjs .

EXPOSE 3030

CMD ["node", "proxy.mjs"]
