import requests

BASE_URL = 'https://easypool-backend-222076803846.asia-south1.run.app'
API_KEY = 'easypool_gps_secret_2026'


def seed_live():
    # 1. Login to get token (to check count later)
    login_url = f'{BASE_URL}/api/auth/token/'
    r = requests.post(login_url, json={'email': 'admin@oakridge.edu', 'password': 'schoolpass'})
    if r.status_code != 200:
        print(f'Login failed: {r.status_code} {r.text}')
        return
    token = r.json()['access']
    headers = {'Authorization': f'Bearer {token}'}

    # 2. Check current buses
    r = requests.get(f'{BASE_URL}/api/buses', headers=headers)
    print(f'Check /api/buses status: {r.status_code}')
    buses = r.json().get('results', [])
    print(f'Current Buses Count: {len(buses)}')

    existing_imeis = [b['gps_imei'] for b in buses if b.get('gps_imei')]
    print(f'Existing IMEIs: {existing_imeis}')

    # 3. Create Buses if missing
    req_buses = [
        {'internal_id': 'OAK-101', 'plate_number': 'TS09AB1234', 'gps_imei': '123456789012345'},
        {'internal_id': 'OAK-201', 'plate_number': 'TS09CD5678', 'gps_imei': '223344556677889'},
    ]

    for bus_data in req_buses:
        if bus_data['gps_imei'] not in existing_imeis:
            print(f'Creating bus {bus_data["internal_id"]}...')
            r = requests.post(f'{BASE_URL}/api/buses', json=bus_data, headers=headers)
            print(f'Create status: {r.status_code} {r.text}')
        else:
            print(f'Bus {bus_data["internal_id"]} already exists')

    # 4. Send Telemetry
    telemetry_url = f'{BASE_URL}/api/gps/telemetry'
    tel_headers = {'X-API-KEY': API_KEY}

    for bus_data in req_buses:
        imei = bus_data['gps_imei']
        data = {
            'imei': imei,
            'lat': 22.5726 + (0.01 * req_buses.index(bus_data)),
            'lng': 88.3639 + (0.01 * req_buses.index(bus_data)),
            'speed': 45,
        }
        r = requests.post(telemetry_url, json=data, headers=tel_headers)
        print(f'Telemetry for {imei}: {r.status_code} {r.text}')

    # 5. Final Count check
    r = requests.get(f'{BASE_URL}/api/gps', headers=headers)
    print(f'Final GPS Point Count: {r.json().get("count")}')


if __name__ == '__main__':
    seed_live()
