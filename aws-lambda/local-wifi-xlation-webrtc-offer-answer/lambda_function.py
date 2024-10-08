import os
import uuid
import ssl
import ipaddress
import uuid
from pymemcache.client.base import Client

context = ssl.create_default_context()

memcached_client = Client((os.environ['ELASTICACHE_URL'], os.environ['ELASTICACHE_PORT']), tls_context=context)

def is_valid_uuid(val):
    try:
        uuid.UUID(str(val))
        return True
    except ValueError:
        return False

def lambda_handler(event, context):
    status_code = 500
    status_headline = 'FAIL'
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
            status_code = 400
            raise Exception("No query parameters: 'status', 'lock', 'unlock', 'chan', 'client' or 'direction'")

        if not 'chan' in event['queryStringParameters']:
            status_code = 400
            raise Exception("Required 'chan' query parameter not specified")
        channel = event['queryStringParameters']['chan']

        if 'status' in event['queryStringParameters']:
            # The status is shared with the sender and all clients in a channel
            # It is locked between reading and writing back to ensure integrity
            if not 'lock' in event['queryStringParameters']:
                status_code = 400
                raise Exception("Required 'lock' query parameter not specified with status")
            key = str(channel) + '_' + ip
            lock = event['queryStringParameters']['lock']
            if not is_valid_uuid(lock):
                status_code = 400
                raise Exception("'lock' query parameter is not a valid UUID")
            result = memcached_client.get(key + 'lock')
            if result is not None and result.decode("utf-8") != lock:
                status_code = 200
                status_headline = 'LOCKED'
                raise Exception("'lock' query parameter is not the same UUID as lock requestor")
            if 'unlock' in event['queryStringParameters'] and http_method == 'GET':
                memcached_client.delete(key + 'lock')
            else:
                # Create a lock to prevent other clients of messing with the status until it is written back or times out
                memcached_client.set(key + 'lock', lock, expire=int(os.environ['ELASTICACHE_LOCK_TIMEOUT']), noreply=False)
        else:
            # The key is made up of:
            #   chan : The translation channel number
            #   client: A client number from a pool allocated by the TX for that channel
            #   direction: One of "offer" or "answer"
            #   ip : The discovered IP address of the client/sender
            if not 'client' in event['queryStringParameters']:
                status_code = 400
                raise Exception("Required 'client' query parameter not specified")
            client = event['queryStringParameters']['client']
            if not 'direction' in event['queryStringParameters']:
                status_code = 400
                raise Exception("Required 'direction' query parameter not specified")
            direction = event['queryStringParameters']['direction']

            key = str(channel) + '_' + str(client) + '_' + str(direction) + '_' + ip

        if http_method == 'POST':
            request_body = event['body']
            memcached_client.set(key, request_body, expire=int(os.environ['ELASTICACHE_TIMEOUT']), noreply=False)
            # Remove the lock on the status
            if 'status' in event['queryStringParameters']:
                memcached_client.delete(key + 'lock')
            body = '{"status" : "OK", "key" : "' + key + '", "message" : ""}'
            status_code = 200
        elif http_method == 'GET':
            result = memcached_client.get(key)
            if result is None:
                body = '{"status" : "MISS", "key" : "' + key + '", "message" : ""}'
                status_code = 200
            else:
                decoded_result = result.decode("utf-8")
                # str(decoded_result) result already is surrounded in double-quotes
                body = '{"status" : "OK", "key" : "' + key + '", "message" : ' + str(decoded_result) + '}'
                status_code = 200
        else:
            status_code = 400
            body = '{"status" : "FAIL", "key" : "' + key + '", "message" : "Request must be POST or GET"}'
    except Exception as e:
        body = '{"status" : "' + status_headline + '", "key" : "' + key + '", "message" : "' + str(e) + '"}'
    finally:
        return {
            'statusCode': status_code,
            'body': body
        }
