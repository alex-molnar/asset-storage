FROM nginx:1.29.8

RUN rm -f /etc/nginx/conf.d/default.conf
RUN rm -f /usr/share/nginx/html/index.html

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY assets /usr/share/nginx/assets
COPY api /usr/share/nginx/api
COPY main/index.html /usr/share/nginx/html
COPY main/routes.html /usr/share/nginx/html
COPY main/accomodations.html /usr/share/nginx/html
COPY main/plan.html /usr/share/nginx/html
