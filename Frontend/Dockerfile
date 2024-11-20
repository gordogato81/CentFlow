
# Production stage
FROM nginx:stable-alpine
COPY ./www /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# COPY /certs/yourdomain.com.crt /etc/nginx/ssl/yourdomain.com.crt
# COPY /certs/yourdomain.com.key /etc/nginx/ssl/yourdomain.com.key
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]