FROM node:22

WORKDIR /app

COPY . .

# Toolchain for native dependencies.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      pkg-config \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
 && rm -rf /var/lib/apt/lists/*

RUN npm install

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
