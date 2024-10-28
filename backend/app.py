import argparse
import json
import math
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, current_app, jsonify, request
from flask_cors import CORS

# Common airport coordinates
# Format: (latitude, longitude)
AIRPORT_COORDINATES = {
    "JFK": (40.6413, -73.7781),  # New York JFK
    "LHR": (51.4700, -0.4543),  # London Heathrow
    "SFO": (37.6213, -122.3790),  # San Francisco
    "LAX": (33.9416, -118.4085),  # Los Angeles
    "ORD": (41.9742, -87.9073),  # Chicago O'Hare
    "DFW": (32.8998, -97.0403),  # Dallas/Fort Worth
    "ATL": (33.6407, -84.4277),  # Atlanta
    "MIA": (25.7959, -80.2870),  # Miami
    "SEA": (47.4502, -122.3088),  # Seattle
    "BOS": (42.3656, -71.0096),  # Boston
    "IAD": (38.9445, -77.4558),  # Washington Dulles
    "DEN": (39.8561, -104.6737),  # Denver
    "LAS": (36.0840, -115.1537),  # Las Vegas
    "PHX": (33.4374, -112.0078),  # Phoenix
    "EWR": (40.6895, -74.1745),  # Newark
    "IAH": (29.9902, -95.3368),  # Houston
    "MCO": (28.4294, -81.3089),  # Orlando
    "YYZ": (43.6777, -79.6248),  # Toronto
    "CDG": (49.0097, 2.5479),  # Paris Charles de Gaulle
    "AMS": (52.3105, 4.7683),  # Amsterdam
    "FRA": (50.0379, 8.5622),  # Frankfurt
    "DXB": (25.2532, 55.3657),  # Dubai
    "SIN": (1.3644, 103.9915),  # Singapore
    "HKG": (22.3080, 113.9185),  # Hong Kong
    "NRT": (35.7720, 140.3929),  # Tokyo Narita
    "PEK": (40.0799, 116.6031),  # Beijing
    "SYD": (-33.9461, 151.1772),  # Sydney
    "FCO": (41.8003, 12.2389),
    # Add more airports as needed
}


def get_airport_coordinates(airport_code: str) -> Optional[Tuple[float, float]]:
    """
    Get the coordinates for a given airport code.

    Args:
        airport_code: IATA airport code (e.g., 'JFK', 'SFO')

    Returns:
        Tuple of (latitude, longitude) if found, None if not found
    """
    return AIRPORT_COORDINATES.get(airport_code.upper())


def calculate_new_position(
    start_lat: float,
    start_lon: float,
    heading: float,
    speed: float,  # ground speed in knots
    elapsed_time: float,  # time in hours
) -> Tuple[float, float]:
    """
    Calculate new position based on initial position, heading, speed and time elapsed.
    Uses great circle navigation formulas for accuracy over longer distances.

    Args:
        start_lat: Starting latitude in degrees
        start_lon: Starting longitude in degrees
        heading: True heading in degrees
        speed: Ground speed in knots
        elapsed_time: Time elapsed in hours

    Returns:
        Tuple of (new_latitude, new_longitude) in degrees
    """
    # Convert inputs to radians
    lat1 = math.radians(start_lat)
    lon1 = math.radians(start_lon)
    heading_rad = math.radians(heading)

    # Calculate distance traveled in nautical miles
    distance = speed * elapsed_time

    # Convert distance to angular distance in radians
    # 60 nautical miles = 1 degree of great circle arc
    angular_distance = math.radians(distance / 60.0)

    # Calculate new position using great circle navigation formulas
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(heading_rad)
    )

    lon2 = lon1 + math.atan2(
        math.sin(heading_rad) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )

    # Convert back to degrees
    return (math.degrees(lat2), math.degrees(lon2))


def interpolate_missing_positions(
    readings: List[Dict], departure_airport: str = None
) -> List[Dict]:
    """
    Fill in missing latitude/longitude values in flight readings using
    dead reckoning based on heading, speed, and time elapsed.

    Args:
        readings: List of reading dictionaries with timestamp, heading, ground_speed,
                 latitude, and longitude fields
        departure_airport: Optional IATA code for departure airport to use as starting position

    Returns:
        List of readings with missing positions filled in where possible
    """
    if not readings:
        return readings

    # Sort readings by timestamp
    sorted_readings = sorted(readings, key=lambda x: x["timestamp"])

    # Find last known good position to start from
    last_good_idx = -1
    for i, reading in enumerate(sorted_readings):
        if reading["latitude"] is not None and reading["longitude"] is not None:
            last_good_idx = i
            break

    # If no good starting position found, try to use departure airport coordinates
    if last_good_idx == -1 and departure_airport:
        airport_coords = get_airport_coordinates(departure_airport)
        if airport_coords:
            # Set the first reading's position to the departure airport
            sorted_readings[0]["latitude"] = airport_coords[0]
            sorted_readings[0]["longitude"] = airport_coords[1]
            sorted_readings[0]["position_interpolated"] = True
            sorted_readings[0]["position_source"] = "airport_reference"
            last_good_idx = 0

    # If still no good starting position, we can't interpolate
    if last_good_idx == -1:
        return readings

    # Process all readings after the first good position
    for i in range(last_good_idx + 1, len(sorted_readings)):
        current = sorted_readings[i]
        previous = sorted_readings[i - 1]

        # Skip if we already have position
        if current["latitude"] is not None and current["longitude"] is not None:
            current["position_interpolated"] = False
            current["position_source"] = "actual"
            continue

        # Skip if we don't have required navigation data
        if (
            current["ground_speed"] is None
            or current["true_heading"] is None
            or previous["latitude"] is None
            or previous["longitude"] is None
        ):
            continue

        # Calculate time elapsed in hours
        try:
            current_time = datetime.fromisoformat(current["timestamp"])
            prev_time = datetime.fromisoformat(previous["timestamp"])
            elapsed_time = (current_time - prev_time).total_seconds() / 3600.0
        except (ValueError, TypeError):
            continue

        # Calculate new position
        try:
            new_lat, new_lon = calculate_new_position(
                previous["latitude"],
                previous["longitude"],
                current["true_heading"],
                current["ground_speed"],
                elapsed_time,
            )

            # Update the reading with calculated position
            current["latitude"] = round(new_lat, 4)
            current["longitude"] = round(new_lon, 4)
            current["position_interpolated"] = True
            current["position_source"] = "interpolated"

        except (ValueError, TypeError):
            continue

    return sorted_readings


def parse_for_airline(content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse the incoming record content and format it for database insertion.

    Args:
        content: Dictionary containing the flight data

    Returns:
        Dictionary with formatted data ready for database insertion
    """
    # Extract raw_data if it exists, ensure it's a string
    raw_data = content.get("raw_data")
    if isinstance(raw_data, dict):
        raw_data = json.dumps(raw_data)
    elif raw_data is None:
        raw_data = "{}"

    # Format the data for database insertion
    return {
        "timestamp": content.get("timestamp"),
        "departure_airport": content.get("departure_airport"),
        "destination_airport": content.get("destination_airport"),
        "flight_number": content.get("flight_number"),
        "aircraft_type": content.get("aircraft_type"),
        "latitude": content.get("latitude"),
        "longitude": content.get("longitude"),
        "altitude": content.get("altitude"),
        "estimated_arrival_time": content.get("estimated_arrival_time"),
        "scheduled_departure_time": content.get("scheduled_departure_time"),
        "time_to_destination_minutes": content.get("time_to_destination_minutes"),
        "total_flight_time_minutes": content.get("total_flight_time_minutes"),
        "distance_to_destination": content.get("distance_to_destination"),
        "distance_from_origin": content.get("distance_from_origin"),
        "distance_traveled": content.get("distance_traveled"),
        "wind_speed": content.get("wind_speed"),
        "wind_direction": content.get("wind_direction"),
        "ground_speed": content.get("ground_speed"),
        "outside_air_temperature": content.get("outside_air_temperature"),
        "true_heading": content.get("true_heading"),
        "weight_on_wheels": content.get("weight_on_wheels", False),
        "decompression": content.get("decompression", False),
        "all_doors_closed": content.get("all_doors_closed", True),
        "raw_data": raw_data,
    }


def write_to_readings(parsed_data: Dict[str, Any]) -> None:
    """
    Write the parsed data to the readings table.

    Args:
        parsed_data: Dictionary containing formatted flight data
    """
    conn = sqlite3.connect("flight_data.db")
    try:
        cursor = conn.cursor()

        # Create the SQL insert statement dynamically based on the parsed data
        fields = list(parsed_data.keys())
        placeholders = ",".join(["?" for _ in fields])
        sql = f"INSERT INTO readings ({','.join(fields)}) VALUES ({placeholders})"

        # Execute the insert with the values from parsed_data
        cursor.execute(sql, list(parsed_data.values()))
        conn.commit()
    finally:
        conn.close()


def create_app(airline=None):
    """Factory function to create the Flask application with configuration."""
    app = Flask(__name__)

    app.config["AIRLINE"] = airline

    cors = CORS(
        app,
        resources={
            r"/*": {
                "origins": [
                    r"http://localhost:[0-9]+",
                    r"http://127.0.0.1:[0-9]+",
                ],
                "methods": ["GET", "POST"],
                "allow_headers": ["Content-Type"],
            }
        },
    )

    def get_all_readings():
        """Get all position data for the flight."""
        conn = sqlite3.connect("flight_data.db")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                SELECT *
                FROM readings
                WHERE altitude > 10000
                ORDER BY timestamp ASC
                """,
            )
            results = cursor.fetchall()
            if not results:
                return {"status": "error", "message": "No position data available"}

            readings = [
                {
                    "airline": current_app.config["AIRLINE"],
                    "timestamp": result["timestamp"],
                    "departure_airport": result["departure_airport"],
                    "destination_airport": result["destination_airport"],
                    "flight_number": result["flight_number"],
                    "aircraft_type": result["aircraft_type"],
                    "latitude": result["latitude"],
                    "longitude": result["longitude"],
                    "altitude": result["altitude"],
                    "estimated_arrival_time": result["estimated_arrival_time"],
                    "scheduled_departure_time": result["scheduled_departure_time"],
                    "time_to_destination_minutes": result[
                        "time_to_destination_minutes"
                    ],
                    "total_flight_time_minutes": result["total_flight_time_minutes"],
                    "distance_to_destination": result["distance_to_destination"],
                    "distance_from_origin": result["distance_from_origin"],
                    "distance_traveled": result["distance_traveled"],
                    "wind_speed": result["wind_speed"],
                    "wind_direction": result["wind_direction"],
                    "ground_speed": result["ground_speed"],
                    "outside_air_temperature": result["outside_air_temperature"],
                    "true_heading": result["true_heading"],
                    "weight_on_wheels": result["weight_on_wheels"],
                    "decompression": result["decompression"],
                    "all_doors_closed": result["all_doors_closed"],
                    "raw_data": json.loads(result["raw_data"]),
                    "position_interpolated": False,  # Add flag for interpolated positions
                    "position_source": "actual",  # Track source of position data
                }
                for result in results
            ]

            # Get the departure airport from the first reading
            departure_airport = readings[0]["departure_airport"] if readings else None

            # Interpolate any missing positions
            readings = interpolate_missing_positions(readings, departure_airport)

            return readings
        finally:
            conn.close()

    @app.route("/readings")
    def readings():
        """Endpoint to return all readings for the flight."""
        # Check for dummy data parameter
        return jsonify(get_all_readings())

    @app.route("/query", methods=["POST"])
    def query():
        """Execute a custom query on the flight data."""
        conn = sqlite3.connect("anon_data.db")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            query_data = request.get_json()
            query = query_data.get("query", "")

            # Execute the query
            cursor.execute(query)
            results = [dict(row) for row in cursor.fetchall()]

            # Return in the format expected by the frontend
            return jsonify(results)

        except sqlite3.Error as e:
            print(e)
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            print(e)
            return jsonify({"error": str(e)}), 500
        finally:
            conn.close()

    @app.route("/record", methods=["POST"])
    def record():
        """Record readings."""
        try:
            data = request.get_json()
            content = data.get("content")

            # Parse the content
            parsed_data = parse_for_airline(content)

            # Write to database
            write_to_readings(parsed_data)

            return jsonify(
                {
                    "status": "success",
                    "message": "Content successfully recorded to database",
                }
            ), 200
        except Exception as e:
            print(e)
            return jsonify({"error": str(e)}), 400

    @app.route("/schema")
    def schema():
        """Return the database schema in the format expected by the frontend."""
        conn = sqlite3.connect("anon_data.db")
        cursor = conn.cursor()

        try:
            # Get all tables
            cursor.execute("""
                SELECT name 
                FROM sqlite_master 
                WHERE type='table'
                ORDER BY name
            """)
            tables = cursor.fetchall()

            # Build schema object matching frontend interface
            schema = {}
            for (table_name,) in tables:
                cursor.execute(f"PRAGMA table_info({table_name})")
                columns = cursor.fetchall()

                # Format columns to match frontend ColumnInfo interface
                schema[table_name] = [
                    {
                        "name": col[1],
                        "type": col[2],
                        "notnull": bool(col[3]),
                        "pk": bool(col[5]),
                    }
                    for col in columns
                ]

            return jsonify(schema)

        except sqlite3.Error as e:
            return jsonify({"error": f"Database error: {str(e)}"}), 500
        finally:
            conn.close()

    return app


def main():
    parser = argparse.ArgumentParser(description="Flight Position API Server")
    parser.add_argument("--airline", required=True, help="Airline name")
    parser.add_argument(
        "--port",
        type=int,
        default=1337,
        help="Port to run the server on (default: 1337)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to run the server on (default: 127.0.0.1)",
    )
    args = parser.parse_args()

    app = create_app(airline=args.airline)
    app.run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
