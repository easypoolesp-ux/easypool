#!/bin/bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt-get install -y docker-compose

# Create workspace
mkdir -p /root/gb28181-server/mysql/data
mkdir -p /root/gb28181-server/zlm
cd /root/gb28181-server

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)

# Create docker-compose.yml
cat <<EOF > docker-compose.yml
services:
  zlm:
    image: zlmediakit/zlmediakit:master
    container_name: zlm
    volumes:
      - ./zlm:/opt/media/conf
    restart: always
    network_mode: host

  redis:
    image: redis:6.0
    container_name: redis
    restart: always

  mysql:
    image: mysql:5.7
    container_name: mysql
    environment:
      MYSQL_ROOT_PASSWORD: "root"
      MYSQL_DATABASE: "wvp"
    volumes:
      - ./mysql/data:/var/lib/mysql
    restart: always

  wvp:
    image: 648540858/wvp_pro:latest
    container_name: wvp
    depends_on:
      - redis
      - mysql
      - zlm
    ports:
      - "18080:18080"
      - "5060:5060/udp"
      - "5060:5060/tcp"
    environment:
      - SPRING_DATASOURCE_DYNAMIC_DATASOURCE_MASTER_URL=jdbc:mysql://mysql:3306/wvp?useUnicode=true&characterEncoding=UTF-8&autoReconnect=true&useSSL=false
      - SPRING_REDIS_HOST=redis
      - WVP_SIP_IP=\$PUBLIC_IP
      - WVP_MEDIA_IP=\$PUBLIC_IP
      - WVP_MEDIA_HTTP_PORT=80
      - WVP_MEDIA_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc
    restart: always
EOF

# Launch
PUBLIC_IP=\$PUBLIC_IP docker-compose up -d
