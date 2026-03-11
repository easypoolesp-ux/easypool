# School Bus Safety System

This project is structured to manage a scalable school bus safety infrastructure on Google Cloud Platform.

## Directory Structure

- `infra/`: Contains Terragrunt/Terraform code to provision GCP resources (VPC, Subnet, GCE Instance with IPv6).
- `services/`: Contains Dockerized microservices.
  - `video-gateway/`: MediaMTX service for RTSP/WebRTC/HLS streaming.
- `docker-compose.yml`: Orchestrates all services for easy deployment.

## Deployment Guide

### 1. Provision Infrastructure
Navigate to the GCE infrastructure directory and apply the Terragrunt configuration:
```bash
cd infra/live/gcp-server
terragrunt apply
```
*Wait for the deployment to finish. It will install Docker and Docker-compose on the VM automatically.*

### 2. Deploy Services to VM
To deploy the services, you need to copy the files to the VM and run docker-compose:

```bash
# From the project root, copy the files to the VM
gcloud compute scp --recurse services docker-compose.yml camera-relay-server:~/ --zone=asia-south1-a

# SSH into the VM and start the services
gcloud compute ssh camera-relay-server --zone=asia-south1-a --command "sudo docker-compose up -d"
```

## Management
- **MediaMTX Dashboard**: Accessible via `http://[YOUR_SERVER_IPV6]:8080` (if API port is open).
- **WebRTC Stream**: Available on port `8889`.
- **HLS Stream**: Available on port `8888`.
