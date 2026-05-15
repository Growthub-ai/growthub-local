FROM node:22-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY models ./models

ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
