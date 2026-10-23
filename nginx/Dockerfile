# nginx is the single public entry point (port 80).
FROM nginx:1.27-alpine

# Replace the default site with our own config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The small test page.
COPY html/ /usr/share/nginx/html/
