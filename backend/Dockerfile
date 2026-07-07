FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/

RUN mkdir -p uploads logs

# Railway sets PORT dynamically — do not hardcode
CMD ["node", "src/server.js"]
