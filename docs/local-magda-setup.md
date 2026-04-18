# Local MAGDA Setup (macOS + minikube)

This machine has been prepared to run MAGDA locally.

## Installed tooling

- Homebrew: installed
- Docker Desktop CLI: installed (`docker` available)
- `kubectl`: installed
- `helm`: installed (`v4.1.4`)
- `minikube`: installed (`v1.38.1`)

## Cluster setup used

```bash
minikube start --driver=docker --cpus=3 --memory=6144
kubectl create namespace magda --dry-run=client -o yaml | kubectl apply -f -
```

## Recommended deployment command (lean profile for this machine)

```bash
helm upgrade --namespace magda --install --timeout 9999s \
  --set global.openfaas.enabled=false \
  --set global.searchEngine.hybridSearch.enabled=false \
  --set tags.all=false \
  --set tags.apidocs-server=true \
  --set tags.authorization-api=true \
  --set tags.authorization-db=true \
  --set tags.combined-db=true \
  --set tags.content-api=true \
  --set tags.content-db=true \
  --set tags.gateway=true \
  --set tags.indexer=true \
  --set tags.opensearch=true \
  --set tags.registry-api=true \
  --set tags.registry-db=true \
  --set tags.search-api=true \
  --set tags.session-db=true \
  --set tags.storage-api=true \
  --set tags.web-server=true \
  --set tags.admin-api=true \
  --set magda-core.gateway.service.type=LoadBalancer \
  --set-string "magda-core.gateway.helmet.contentSecurityPolicy.directives.defaultSrc[0]='self'" \
  magda oci://ghcr.io/magda-io/charts/magda
```

## Access details

- Minikube IP: `192.168.49.2`
- Gateway NodePort: retrieve dynamically with:

```bash
kubectl get svc gateway -n magda -o jsonpath='{.spec.ports[0].nodePort}'
```

If gateway is not reachable yet, check pod readiness:

```bash
kubectl get pods -n magda
kubectl get deploy -n magda
```

## Generated credentials

To fetch the currently active secrets from the running cluster:

```bash
kubectl get secret auth-secrets -n magda -o jsonpath='{.data.jwt-secret}' | base64 --decode && echo
kubectl get secret auth-secrets -n magda -o jsonpath='{.data.session-secret}' | base64 --decode && echo
kubectl get secret db-main-account-secret -n magda -o jsonpath='{.data.postgresql-password}' | base64 --decode && echo
```

## Smoke test commands

Registry API check:

```bash
kubectl port-forward -n magda svc/registry-api 6111:80
# in another terminal:
curl "http://127.0.0.1:6111/v0/records?limit=1"
```

Gateway check:

```bash
kubectl port-forward -n magda svc/gateway 6120:80
# in another terminal:
curl -I "http://127.0.0.1:6120/"
```

## Current known issue on this machine

- Full default chart can exceed practical startup limits on this local Docker/minikube setup and leave many pods in `ContainerCreating` / `Pending`.
- Confirmed scheduler constraint seen during setup: `Insufficient memory` for some optional components.
- Lean profile above is the stable path for day-to-day local development on this hardware.

If OpenSearch is not ready yet, `indexer` may restart with `Connection refused` to `opensearch:9200` until OpenSearch finishes startup.

```bash
kubectl get pods -n magda
kubectl get deploy -n magda
```

## Useful follow-up commands

```bash
helm list -n magda
kubectl get svc -n magda
kubectl describe pod -n magda <pod-name>
kubectl logs -n magda <pod-name>
```

To tear down:

```bash
helm uninstall -n magda magda
minikube delete
```
