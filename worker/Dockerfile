FROM node:22-alpine
WORKDIR /app
# git is required because @whiskeysockets/baileys depends on "libsignal" via a
# git+https URL rather than the npm registry — alpine images don't ship git by default.
RUN apk add --no-cache git
COPY package*.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
CMD ["npm","start"]
