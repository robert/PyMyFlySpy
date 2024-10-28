import argparse
import json
import random
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List


def setup_database(db_path):
    """Set up the SQLite database with the required schema."""
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Create readings table with all required fields
    c.execute("""CREATE TABLE IF NOT EXISTS readings
                (id INTEGER PRIMARY KEY AUTOINCREMENT,
                 timestamp TEXT NOT NULL,
                 latitude REAL,
                 longitude REAL,
                 altitude REAL,
                 estimated_arrival_time TEXT,
                 ground_speed REAL,
                 outside_air_temperature REAL,
                 true_heading REAL,
                 wind_direction REAL,
                 wind_speed REAL,
                 distance_to_destination REAL,
                 distance_from_origin REAL,
                 distance_traveled REAL,
                 weight_on_wheels TEXT,
                 time_to_destination_minutes INTEGER,
                 total_flight_time_minutes INTEGER,
                 scheduled_departure_time TEXT,
                 decompression TEXT,
                 all_doors_closed TEXT,
                 departure_airport TEXT,
                 destination_airport TEXT,
                 flight_number TEXT,
                 aircraft_type TEXT,
                 raw_data JSON,
                 UNIQUE(timestamp))""")

    # Create indexes
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings(timestamp)"
    )

    conn.commit()
    conn.close()


def generate_demo_data(
    airline: str, flight_nickname: str, num_points: int = 100
) -> List[Dict]:
    """Generate realistic-looking flight data points."""
    # Flight parameters
    FLIGHT_DURATION_MINUTES = 420  # 7 hour flight
    START_TIME = (datetime.now() - timedelta(hours=8)).replace(microsecond=0)

    # Flight details
    departure_airport = "SFO"
    destination_airport = "JFK"
    flight_number = f"{airline}{random.randint(1000, 9999)}"
    aircraft_type = random.choice(["B737", "A320", "B787", "A350"])

    # Flight path parameters
    start_lat, start_lon = 37.6213, -122.3790  # SFO
    end_lat, end_lon = 40.6413, -73.7781  # JFK
    cruise_altitude = random.randint(34000, 38000)

    data_points = []

    for i in range(num_points):
        progress = i / (num_points - 1)
        timestamp = START_TIME + timedelta(minutes=FLIGHT_DURATION_MINUTES * progress)

        # Calculate position
        if progress < 0.1:  # Takeoff
            lat = start_lat + (start_lat + 2 - start_lat) * (progress / 0.1)
            lon = start_lon + (start_lon + 3 - start_lon) * (progress / 0.1)
        elif progress > 0.9:  # Landing
            lat = (end_lat + 2) + (end_lat - (end_lat + 2)) * ((progress - 0.9) / 0.1)
            lon = (end_lon + 3) + (end_lon - (end_lon + 3)) * ((progress - 0.9) / 0.1)
        else:  # Cruise
            lat = start_lat + (end_lat - start_lat) * ((progress - 0.1) / 0.8)
            lon = start_lon + (end_lon - start_lon) * ((progress - 0.1) / 0.8)
            # Add some variance
            lat += random.uniform(-0.5, 0.5)
            lon += random.uniform(-0.5, 0.5)

        # Calculate altitude
        if progress < 0.1:  # Takeoff
            altitude = cruise_altitude * (progress / 0.1)
        elif progress > 0.9:  # Landing
            altitude = cruise_altitude * ((1 - progress) / 0.1)
        else:  # Cruise
            altitude = cruise_altitude + random.randint(-500, 500)

        # Flight phase
        if progress < 0.1:
            phase = "TAKEOFF"
        elif progress > 0.9:
            phase = "LANDING"
        else:
            phase = "CRUISE"

        # Calculate speeds and environmental data
        ground_speed = random.randint(400, 500)
        wind_speed = random.randint(20, 60)
        wind_direction = random.randint(0, 359)
        outside_temp = random.randint(-50, -30)

        # Calculate distances
        total_distance = 2570  # Approximate SFO-JFK distance in miles
        distance_traveled = total_distance * progress
        distance_to_destination = total_distance - distance_traveled

        data_point = {
            "airline": airline,
            "flight_nickname": flight_nickname,
            "timestamp": timestamp.isoformat(),
            "departure_airport": departure_airport,
            "destination_airport": destination_airport,
            "flight_number": flight_number,
            "aircraft_type": aircraft_type,
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "altitude": round(altitude),
            "estimated_arrival_time": (
                START_TIME + timedelta(minutes=FLIGHT_DURATION_MINUTES)
            ).isoformat(),
            "scheduled_departure_time": START_TIME.isoformat(),
            "time_to_destination_minutes": round(
                FLIGHT_DURATION_MINUTES * (1 - progress)
            ),
            "total_flight_time_minutes": FLIGHT_DURATION_MINUTES,
            "distance_to_destination": round(distance_to_destination),
            "distance_from_origin": round(distance_traveled),
            "distance_traveled": round(distance_traveled),
            "wind_speed": wind_speed,
            "wind_direction": wind_direction,
            "ground_speed": ground_speed,
            "outside_air_temperature": outside_temp,
            "true_heading": round(random.randint(0, 359)),
            "weight_on_wheels": "1" if progress < 0.02 or progress > 0.98 else "0",
            "decompression": "0",
            "all_doors_closed": "0" if progress < 0.02 or progress > 0.98 else "1",
            "raw_data": json.dumps(
                {
                    "additional_sensors": {
                        "cabin_pressure": random.randint(8000, 8500),
                        "fuel_remaining": round(100 - (progress * 70), 1),
                        "engine_n1": random.randint(85, 92)
                        if phase == "CRUISE"
                        else random.randint(92, 98),
                    }
                }
            ),
        }
        data_points.append(data_point)

    return data_points


def write_demo_data_to_db(
    db_path: str, airline: str, flight_nickname: str, num_points: int = 100
):
    """Generate demo data and write it to the database."""
    # Set up database
    setup_database(db_path)

    # Generate demo data
    data_points = generate_demo_data(airline, flight_nickname, num_points)

    # Write to database
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    for point in data_points:
        try:
            c.execute(
                """
                INSERT INTO readings (
                    timestamp, latitude, longitude, altitude,
                    estimated_arrival_time, ground_speed, outside_air_temperature,
                    true_heading, wind_direction, wind_speed, distance_to_destination,
                    distance_from_origin, distance_traveled, weight_on_wheels,
                    time_to_destination_minutes, total_flight_time_minutes,
                    scheduled_departure_time, decompression,
                    all_doors_closed, departure_airport, destination_airport,
                    flight_number, aircraft_type, raw_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    point["timestamp"],
                    point["latitude"],
                    point["longitude"],
                    point["altitude"],
                    point["estimated_arrival_time"],
                    point["ground_speed"],
                    point["outside_air_temperature"],
                    point["true_heading"],
                    point["wind_direction"],
                    point["wind_speed"],
                    point["distance_to_destination"],
                    point["distance_from_origin"],
                    point["distance_traveled"],
                    point["weight_on_wheels"],
                    point["time_to_destination_minutes"],
                    point["total_flight_time_minutes"],
                    point["scheduled_departure_time"],
                    point["decompression"],
                    point["all_doors_closed"],
                    point["departure_airport"],
                    point["destination_airport"],
                    point["flight_number"],
                    point["aircraft_type"],
                    point["raw_data"],
                ),
            )
        except sqlite3.IntegrityError:
            # Skip duplicate timestamps
            continue

    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Generate demo flight data and store in database"
    )
    parser.add_argument("--airline", default="DEMO", help="Airline code (e.g., BA, VS)")
    parser.add_argument(
        "--flight-nickname",
        help="Nickname for the flight",
        default="DEMO-FLIGHT",
    )
    parser.add_argument(
        "--num-points", type=int, default=100, help="Number of data points to generate"
    )
    parser.add_argument(
        "--db-path", default="flight_data.db", help="Path to the SQLite database"
    )

    args = parser.parse_args()

    write_demo_data_to_db(
        args.db_path, args.airline, args.flight_nickname, args.num_points
    )
    print(f"Demo data generated and written to {args.db_path}")


if __name__ == "__main__":
    main()
