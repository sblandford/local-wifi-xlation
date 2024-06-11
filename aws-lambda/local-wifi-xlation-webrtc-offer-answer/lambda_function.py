import json
import os
import uuid
import ssl
import ipaddress
from pymemcache.client.base import Client

context = ssl.create_default_context()

memcached_client = Client((os.environ['ELASTICACHE_URL'], os.environ['ELASTICACHE_PORT']), tls_context=context)


def lambda_handler(event, context):
    status_code = None
    message = None
    key = 'none'

    try:
        http_method = event['requestContext']['http']['method']
        ip = event['requestContext']['http']['sourceIp']
        ip_obj = ipaddress.ip_address(ip)
        if ip_obj.version == 6:
            # Round IPv6 address to LAN
            ip = str(ipaddress.ip_network(ip + '/64', strict=False))

        if not 'queryStringParameters' in event:
            raise Exception("No query parameters: 'status', 'chan', 'client' or 'direction'")
            
        if not 'chan' in event['queryStringParameters']:
            raise Exception("Required 'chan' query parameter not specified")
        channel = event['queryStringParameters']['chan']

        if 'status' in event['queryStringParameters']:
            key = str(channel) + '_' + ip
        else:
            if not 'client' in event['queryStringParameters']:
                raise Exception("Required 'client' query parameter not specified")
            client = event['queryStringParameters']['client']
            if not 'direction' in event['queryStringParameters']:
                raise Exception("Required 'direction' query parameter not specified")
            direction = event['queryStringParameters']['direction']
    
            key = str(channel) + '_' + str(client) + '_' + str(direction) + '_' + ip
        
        if http_method == 'POST':
            request_body = json.loads(event['body'])
            memcached_client.set(key, request_body, expire=int(os.environ['ELASTICACHE_TIMEOUT']), noreply=False)
            status_code = 200
            body = '{"status" : "OK", "key" : "' + key + '", "message" : ""}'
        elif http_method == 'GET':
            result = memcached_client.get(key)
            if result is None:
                status_code = 200
                body = '{"status" : "MISS", "key" : "' + key + '", "message" : ""}'
            else:
                decoded_result = result.decode("utf-8")
                status_code = 200
                body = '{"status" : "OK", "key" : "' + key + '", "message" : "' + str(decoded_result) + '"}'
        else:
            status_code = 400
            body = '{"status" : "FAIL", "key" : "' + key + '", "message" : "Request must be POST or GET"}'
    except Exception as e:
        status_code = 500
        body = '{"status" : "FAIL", "key" : "' + key + '", "message" : "' + str(e) + '"}'
    finally:
        return {
            'statusCode': status_code,
            'body': body
        }    
