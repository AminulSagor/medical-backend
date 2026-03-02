import json

with open('Medical-Backend-API.postman_collection.json') as f:
    data = json.load(f)

endpoint_list = []
for module in data['item']:
    name = module['name']
    endpoints = module.get('item', [])
    for ep in endpoints:
        method = ep['request'].get('method', 'GET')
        raw_url = ep['request']['url'].get('raw', '')
        url = raw_url.replace('{{baseUrl}}', '')
        endpoint_list.append((name, method, url))

print("COMPLETE ENDPOINT LISTING:")
print("=" * 100)
for i, (module, method, url) in enumerate(endpoint_list, 1):
    print(f"{i:2}. [{module:25}] {method:6} {url}")

print("\n" + "=" * 100)
print(f"TOTAL: {len(endpoint_list)} Endpoints")
