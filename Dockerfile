FROM nginx:1.29.8

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY assets /usr/share/nginx/assets
COPY api /usr/share/nginx/api