# Alpine, because then the Docker healthcheck can use wget.
FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json ./
RUN bun install

COPY src ./src

EXPOSE 3004
CMD ["bun", "run", "src/index.ts"]
