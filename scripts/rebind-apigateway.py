#!/usr/bin/env python3
"""
scripts/rebind-apigateway.py
Zero-downtime routing automation for Counterly POS SaaS.
Resolves the newly deployed ECS Fargate task's public IP, verifies container health,
and atomically updates the AWS API Gateway HTTP Proxy integration.
"""

import sys
import time
import json
import argparse
import subprocess
import urllib.request
import urllib.error

def run_aws_json(*args):
    cmd = ["aws"] + list(args) + ["--output", "json"]
    try:
        res = subprocess.check_output(cmd, stderr=subprocess.PIPE)
        return json.loads(res.decode("utf-8"))
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"AWS CLI Error: {e.stderr.decode('utf-8')}\n")
        raise

def get_running_task_ip(cluster: str, service: str, region: str) -> str:
    print(f"[*] Discovering running ECS task for service '{service}' in cluster '{cluster}'...")
    tasks_res = run_aws_json("ecs", "list-tasks", "--cluster", cluster, "--service-name", service, "--desired-status", "RUNNING", "--region", region)
    task_arns = tasks_res.get("taskArns", [])
    if not task_arns:
        raise RuntimeError(f"No running tasks found for service {service}")

    # Describe all running tasks and pick the newest by createdAt
    desc = run_aws_json("ecs", "describe-tasks", "--cluster", cluster, "--tasks", *task_arns, "--region", region)
    tasks = desc.get("tasks", [])
    if not tasks:
        raise RuntimeError("Failed to describe ECS tasks.")

    tasks_sorted = sorted(tasks, key=lambda t: str(t.get("createdAt", "")), reverse=True)
    task_data = tasks_sorted[0]
    target_task_arn = task_data["taskArn"]
    print(f"[+] Found newest active task: {target_task_arn}")

    eni_id = None
    for attachment in task_data.get("attachments", []):
        for detail in attachment.get("details", []):
            if detail.get("name") == "networkInterfaceId":
                eni_id = detail.get("value")
                break

    if not eni_id:
        raise RuntimeError("Failed to extract ENI ID from ECS task attachments.")

    print(f"[+] Task ENI: {eni_id}. Fetching public IP...")
    eni_desc = run_aws_json("ec2", "describe-network-interfaces", "--network-interface-ids", eni_id, "--region", region)
    public_ip = eni_desc["NetworkInterfaces"][0].get("Association", {}).get("PublicIp")

    if not public_ip:
        raise RuntimeError(f"No public IP assigned to ENI {eni_id}.")

    print(f"[✓] Task Public IP successfully resolved: {public_ip}")
    return public_ip

def verify_health(ip: str, port: int, path: str = "/swagger/index.html", max_retries: int = 24, delay: int = 5) -> bool:
    url = f"http://{ip}:{port}{path}"
    print(f"[*] Verifying container health at {url}...")
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HealthCheck/1.0"})
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    print(f"[✓] Container is healthy! HTTP {response.status} received on attempt {attempt}.")
                    return True
        except Exception as e:
            print(f"    [Attempt {attempt}/{max_retries}] Still initializing ({e}). Waiting {delay}s...")
            time.sleep(delay)

    print(f"[✗] Container health check failed after {max_retries} attempts.")
    return False

def update_api_gateway(api_id: str, new_ip: str, port: int, region: str):
    print(f"[*] Updating AWS API Gateway '{api_id}' integrations...")
    integrations_res = run_aws_json("apigatewayv2", "get-integrations", "--api-id", api_id, "--region", region)
    items = integrations_res.get("Items", [])
    if not items:
        raise RuntimeError(f"No integrations found for API ID {api_id}")

    target_uri = f"http://{new_ip}:{port}"
    for item in items:
        integration_id = item["IntegrationId"]
        current_uri = item.get("IntegrationUri", "")
        if current_uri == target_uri:
            print(f"[✓] API Gateway integration {integration_id} is already pointing to {target_uri}.")
            continue

        print(f"[*] Switching integration {integration_id} from '{current_uri}' -> '{target_uri}'...")
        run_aws_json(
            "apigatewayv2", "update-integration",
            "--api-id", api_id,
            "--integration-id", integration_id,
            "--integration-uri", target_uri,
            "--region", region
        )
        print(f"[✓] Integration {integration_id} updated successfully.")

def main():
    parser = argparse.ArgumentParser(description="Zero-Downtime API Gateway Rebind for ECS Fargate")
    parser.add_argument("--cluster", default="pos-cluster", help="ECS cluster name")
    parser.add_argument("--service", default="pos-api-service", help="ECS service name")
    parser.add_argument("--api-id", default="80f96mej30", help="AWS API Gateway ID")
    parser.add_argument("--port", type=int, default=8080, help="Container port")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    args = parser.parse_args()

    try:
        ip = get_running_task_ip(args.cluster, args.service, args.region)
        if not verify_health(ip, args.port):
            sys.exit(1)
        update_api_gateway(args.api_id, ip, args.port, args.region)
        print("[🎉] Zero-downtime deployment routing completed successfully!")
    except Exception as e:
        sys.stderr.write(f"[ERROR] {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
