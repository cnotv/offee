FROM nginx:1.29-alpine
COPY deploy/edge/nginx.conf /etc/nginx/nginx.conf
