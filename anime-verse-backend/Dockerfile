FROM node:22-alpine
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV PORT=8000
EXPOSE ${PORT}
CMD [ "npm", "start" ]
