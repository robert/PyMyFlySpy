'use client';


import { geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom } from 'd3-zoom';
import { Expand, Minimize } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import FlightScrubber from './FlightScrubber';

interface Reading {
    latitude: number;
    longitude: number;
    timestamp: number;
    altitude: number;
    status: string;
    estimated_arrival_time: string;
    scheduled_departure_time: string | null;
    distance_to_destination: number;
    distance_from_origin: number;
    distance_traveled: number;
    outside_air_temperature: number;
    ground_speed: number;
    wind_speed: number;
    wind_direction: number;
    true_heading: number;
    time_to_destination_minutes: number;
    total_flight_time_minutes: number;
    state: string;
    decompression: string;
    all_doors_closed: string;
    weight_on_wheels: string;
    // New fields
    departure_airport: string;
    destination_airport: string;
    flight_number: string;
    aircraft_type: string;
    flight_phase: string;
}

interface WorldData {
    features: any[];
}

interface InteractiveWorldMapProps {
    worldData: WorldData;
}

interface MetricConfig {
    id: string;
    title: string;
    valueFormatter?: (value: any) => any;
    unit?: string;
    color?: string;
}

interface TimeSeriesGraphProps {
    data: any[];
    config: MetricConfig;
    width: number;
    height: number;
}

const METRICS_CONFIG: MetricConfig[] = [
    {
        id: 'longitude',
        title: 'Longitude',
        unit: '°',
        color: '#0000FF',
    },
    {
        id: 'latitude',
        title: 'Latitude',
        unit: '°',
        color: '#FF00FF',
    },
    {
        id: 'altitude',
        title: 'Altitude',
        unit: 'ft',
        color: '#00AA00',
        valueFormatter: (val: number) => val.toFixed(0),
    },
    {
        id: 'ground_speed',
        title: 'Ground Speed',
        unit: 'km/h',
        color: '#FF4400',
        valueFormatter: (val: number) => val.toFixed(0),
    },
    {
        id: 'true_heading',
        title: 'True Heading',
        unit: '°',
        color: '#AA00AA',
        valueFormatter: (val: number) => val.toFixed(1),
    },
    {
        id: 'wind_speed',
        title: 'Wind Speed',
        unit: 'km/h',
        color: '#00AAAA',
        valueFormatter: (val: number) => val.toFixed(1),
    },
    {
        id: 'wind_direction',
        title: 'Wind Direction',
        unit: '°',
        color: '#AAAA00',
        valueFormatter: (val: number) => val.toFixed(1),
    },
    {
        id: 'outside_air_temperature',
        title: 'Temperature',
        unit: '°C',
        color: '#FF0000',
        valueFormatter: (val: number) => val.toFixed(1),
    },
    {
        id: 'distance_to_destination',
        title: 'Distance to Destination',
        unit: 'km',
        color: '#00FF00',
        valueFormatter: (val: number) => val.toFixed(1),
    },
    {
        id: 'distance_from_origin',
        title: 'Distance from Origin',
        unit: 'km',
        color: '#0000AA',
        valueFormatter: (val: number) => val.toFixed(1),
    },
    {
        id: 'time_to_destination_minutes',
        title: 'Time to Destination',
        unit: 'min',
        color: '#AA0000',
        valueFormatter: (val: number) => val.toFixed(0),
    },
    {
        id: 'total_flight_time_minutes',
        title: 'Total Flight Time',
        unit: 'min',
        color: '#00AA00',
        valueFormatter: (val: number) => val.toFixed(0),
    },
];

interface DataSection {
    title: string;
    data: [string, string | number][];
}

// Single flag to control missing data behavior
const SHOW_UNKNOWN = true; // Set to false to hide missing data

const getTableSections = (currentReading: Reading): DataSection[] => {
    const formatOrSkip = (value: any, formatter: (v: any) => string): string | null => {
        if (value === null || value === undefined || value === '') {
            return SHOW_UNKNOWN ? 'Unknown' : null;
        }
        return formatter(value);
    };

    const windComponent = currentReading.wind_speed && currentReading.wind_direction && currentReading.true_heading
        ? calculateWindComponent(
            currentReading.true_heading,
            currentReading.wind_direction,
            currentReading.wind_speed
        )
        : null;

    const timeInAirMinutes = currentReading.total_flight_time_minutes || 0;
    const hours = Math.floor(timeInAirMinutes / 60);
    const minutes = timeInAirMinutes % 60;

    const sections = [
        {
            title: "Flight Information",
            data: [
                ["Time now", new Date().toLocaleTimeString()],
                ["Flight number", formatOrSkip(currentReading.flight_number, v => v)],
                ["Aircraft", formatOrSkip(currentReading.aircraft_type, v => v)],
                ["Route", formatOrSkip(
                    currentReading.departure_airport && currentReading.destination_airport,
                    () => `${currentReading.departure_airport} → ${currentReading.destination_airport}`
                )],
                ["Time in air", formatOrSkip(timeInAirMinutes, () => `${hours}h ${minutes}m`)]
            ]
        },
        {
            title: "Position & Altitude",
            data: [
                ["Latitude", formatOrSkip(currentReading.latitude, v => v.toFixed(4))],
                ["Longitude", formatOrSkip(currentReading.longitude, v => v.toFixed(4))],
                ["Altitude", formatOrSkip(currentReading.altitude, v => `${v} ft`)],
                ["True heading", formatOrSkip(currentReading.true_heading, v => `${v.toFixed(1)}°`)]
            ]
        },
        {
            title: "Speed & Weather",
            data: [
                ["Ground speed", formatOrSkip(currentReading.ground_speed, v => `${v} km/h`)],
                ["Air temp", formatOrSkip(currentReading.outside_air_temperature, v => `${v}°C`)],
                ["Wind", formatOrSkip(
                    currentReading.wind_speed && currentReading.wind_direction,
                    () => `${currentReading.wind_speed} km/h from ${currentReading.wind_direction}°`
                )],
                ["Wind effect", formatOrSkip(
                    windComponent,
                    v => `${Math.abs(v).toFixed(1)} km/h ${v > 0 ? 'tailwind' : 'headwind'}`
                )]
            ]
        },
        {
            title: "Journey Progress",
            data: [
                ["Dist from origin", formatOrSkip(currentReading.distance_from_origin, v => `${v} km`)],
                ["Dist traveled", formatOrSkip(currentReading.distance_traveled, v => `${v} km`)],
                ["Dist to dest", formatOrSkip(currentReading.distance_to_destination, v => `${v} km`)],
                ["Time to dest", formatOrSkip(currentReading.time_to_destination_minutes, v => `${v} min`)]
            ]
        },
        {
            title: "Schedule",
            data: [
                ["Est arrival", formatOrSkip(
                    currentReading.estimated_arrival_time,
                    v => new Date(v).toLocaleTimeString()
                )],
                ["Scheduled departure", formatOrSkip(
                    currentReading.scheduled_departure_time,
                    v => new Date(v).toLocaleTimeString()
                )]
            ]
        },
        {
            title: "Aircraft Status",
            data: [
                ["Flight phase", formatOrSkip(
                    currentReading.state || currentReading.flight_phase,
                    v => getPhaseDescription(v)
                )],
                ["Weight on wheels", formatOrSkip(
                    currentReading.weight_on_wheels,
                    v => v === '1' ? 'Yes' : 'No'
                )],
                ["Doors closed", formatOrSkip(
                    currentReading.all_doors_closed,
                    v => v === '1' ? 'Yes' : 'No'
                )],
                ["Decompression", formatOrSkip(
                    currentReading.decompression,
                    v => v === '1' ? 'Yes' : 'No'
                )]
            ]
        }
    ];

    // Filter out null values if SHOW_UNKNOWN is false
    return sections.map(section => ({
        ...section,
        data: section.data
            .filter(([_, value]) => value !== null)
            .map(([label, value]) => [label, value])
    }));
};

const calculateWindComponent = (trueHeading: number, windDirection: number, windSpeed: number) => {
    // Convert angles to radians
    const headingRad = (trueHeading * Math.PI) / 180;
    const windDirRad = (windDirection * Math.PI) / 180;

    // Calculate the wind component
    const windComponent = windSpeed * Math.cos(windDirRad - headingRad);

    // Positive values indicate tailwind, negative values indicate headwind
    return windComponent;
};

const FlightDataDisplay: React.FC<{ reading: Reading }> = ({ reading }) => {
    const sections = getTableSections(reading);

    return (
        <div className="space-y-4">
            {sections.map((section, i) => (
                <div key={i} className="space-y-1">
                    <div className="font-bold text-sm text-gray-700 uppercase tracking-wide">
                        {section.title}
                    </div>
                    {section.data.map((td, j) => (
                        <div key={j} className="flex justify-between">
                            <span>{td[0]}:</span>
                            <span className={td[1] === 'Unknown' ? 'text-gray-400' : ''}>
                                {td[1]}
                            </span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

const getPhaseDescription = (phase: string) => {
    const phases: { [key: string]: string } = {
        '1': 'Pre-flight',
        '2': 'Taxi',
        '3': 'Take-off',
        '4': 'Initial Climb',
        '5': 'En Route',
        '6': 'Approach',
        '7': 'Landing',
        '8': 'Post-flight',
    };
    return phases[phase] || phase;
};

const TimeSeriesGraph = ({ data, config, width, height }: TimeSeriesGraphProps) => {
    return (
        <div>
            <div className="font-mono mb-2 text-sm font-semibold">
                {config.title}
                {config.unit && ` (${config.unit})`}
            </div>
            <LineChart
                width={width}
                height={height}
                data={data}
                margin={{ top: 5, right: -25, bottom: 25, left: 5 }}
            >
                <Line
                    type="monotone"
                    dataKey="val"
                    stroke={config.color || '#0000FF'}
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                />
                <YAxis
                    domain={['auto', 'auto']}
                    tick={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        fill: '#4B5563' // gray-600
                    }}
                    tickFormatter={config.valueFormatter}
                    axisLine={{ stroke: '#9CA3AF' }} // gray-400
                    tickLine={{ stroke: '#9CA3AF' }} // gray-400
                    label={{
                        value: config.unit,
                        angle: -90,
                        position: 'insideLeft',
                        style: {
                            fontSize: 11,
                            fontFamily: 'monospace',
                            fill: '#4B5563'
                        }
                    }}
                />
                <XAxis
                    dataKey="time"
                    domain={['auto', 'auto']}
                    tick={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        fill: '#4B5563'
                    }}
                    angle={-45}
                    textAnchor="end"
                    tickMargin={8}
                    axisLine={{ stroke: '#9CA3AF' }}
                    tickLine={{ stroke: '#9CA3AF' }}
                    interval="preserveStartEnd"
                    minTickGap={20}
                />
                <Tooltip
                    formatter={(value: any) =>
                        [
                            config.valueFormatter ? config.valueFormatter(value) : value,
                            config.title
                        ]
                    }
                    contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #E5E7EB', // gray-200
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                    labelStyle={{
                        color: '#4B5563', // gray-600
                        marginBottom: '4px'
                    }}
                />
            </LineChart>
        </div>
    );
};


const prepareGraphData = (readings: Reading[], metricConfig: MetricConfig) => {
    const rs = readings.map(reading => ({
        time: new Date(reading.timestamp).toLocaleTimeString(),
        val: reading[metricConfig.id as keyof Reading],
    }))
    console.log(rs);
    return rs;
};



const PlaneIcon = ({ x, y, heading, scale }: { x: number, y: number, heading: number, scale: number }) => {
    return (
        <g transform={`translate(${x},${y}) scale(${1 / scale}) rotate(${heading})`}>
            <image
                href="/images/airplane-15-64.png"  // This path points to public/images/plane.png
                x="-15"
                y="-15"
                width="30"
                height="30"
                style={{ transformOrigin: 'center' }}
            />
        </g>
    );
};


const InteractiveWorldMap = ({ worldData }: InteractiveWorldMapProps) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({
        width: 1200,
        height: 800
    });
    const [currentReading, setCurrentReading] = useState<Reading | null>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const [readings, setReadings] = useState<Reading[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedTime, setSelectedTime] = useState(null);

    useEffect(() => {
        setDimensions({
            width: window.innerWidth,
            height: window.innerHeight
        });
    }, []);

    const projection = geoMercator()
        .scale((dimensions.width) / (2 * Math.PI))
        .translate([dimensions.width / 2, dimensions.height / 2]);

    const pathGenerator = geoPath().projection(projection);

    const zoomBehavior = zoom()
        .scaleExtent([1, 8])
        .extent([[0, 0], [dimensions.width, dimensions.height]])
        .translateExtent([
            [-dimensions.width / 2, -dimensions.height / 2],
            [dimensions.width * 1.5, dimensions.height * 1.5]
        ])
        .on('zoom', (event) => {
            setTransform({
                x: event.transform.x,
                y: event.transform.y,
                k: event.transform.k
            });
        });

    useLayoutEffect(() => {
        if (svgRef.current) {
            select(svgRef.current).call(zoomBehavior);
        }
    }, [dimensions]);

    // Modified fetching logic to get all readings at once
    const fetchReadings = async () => {
        try {
            const response = await fetch('http://localhost:1337/readings');
            const data = await response.json();
            console.log(data);

            // Sort readings by timestamp to ensure correct ordering
            const sortedReadings = data.sort((a: Reading, b: Reading) => a.timestamp - b.timestamp);

            setReadings(sortedReadings);

            // Set current reading to the most recent one
            if (sortedReadings.length > 0) {
                setCurrentReading(sortedReadings[sortedReadings.length - 1]);
            }
        } catch (error) {
            console.error('Error fetching readings:', error);
        }
    };

    useEffect(() => {
        fetchReadings();
        const interval = setInterval(fetchReadings, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const renderMapFeatures = () => {
        return worldData.features.map((feature, i) => (
            <path
                key={`feature-${i}`}
                d={pathGenerator(feature)}
                desc={feature['properties']['NAME']}
                fill="#90EE90"
                stroke="#13579A"
            //strokeWidth={1.5 / transform.k}
            />
        ));
    };

    const renderCurrentReading = () => {
        if (!currentReading) return null;

        const coords = projection([currentReading.longitude, currentReading.latitude]);
        if (!coords || !coords[0] || !coords[1]) return null;

        return (
            <PlaneIcon
                x={coords[0]}
                y={coords[1]}
                heading={currentReading.true_heading - 25}
                scale={2 / transform.k ** 0.1}
            />
        );
    };

    const renderReadingHistory = () => {
        if (readings.length < 2) return null;

        const pathData = readings
            .map(pos => {
                const coords = projection([pos.longitude, pos.latitude]);
                if (!coords || !coords[0] || !coords[1]) return null;
                return `${coords[0]},${coords[1]}`;
            })
            .filter(coords => coords !== null)
            .join(' L ');

        if (!pathData) return null;

        return (
            <path
                d={`M ${pathData}`}
                stroke="#FF0000"
                strokeWidth={5 / transform.k}
                fill="none"
                strokeOpacity={1.0}
            />
        );
    };

    const chartSize = isExpanded ? {
        width: Math.min((dimensions.width - 100) / 2, 600),
        height: Math.min((dimensions.height - 240) / 2, 300)
    } : {
        width: 260,
        height: 160
    };

    return (
        <div className="relative w-full h-screen">
            {currentReading && (
                <div
                    className={`
                        fixed z-10 bg-white/80 rounded shadow text-black font-mono font-medium 
                        transition-all duration-300 ease-in-out
                        ${isExpanded
                            ? 'top-4 left-4 right-4 bottom-4 w-auto h-auto'
                            : 'top-4 left-4 w-80 max-h-[calc(100vh-2rem)]'
                        }
                    `}
                >
                    <div className="flex justify-between items-start p-4 border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm">
                        <h1 className="text-3xl font-bold text-gray-800">
                            PyMyFlySpy
                        </h1>
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors ml-auto"
                        >
                            {isExpanded ? <Minimize size={20} /> : <Expand size={20} />}
                        </button>
                    </div>

                    <div className={`
                        ${isExpanded
                            ? 'h-full overflow-auto opacity-90'
                            : 'max-h-[calc(100vh-6rem)] overflow-y-auto'
                        }
                    `}>
                        {currentReading && (
                            <FlightScrubber
                                currentTime={selectedTime || currentReading.timestamp}
                                startTime={readings[0]?.timestamp || currentReading.timestamp}
                                estimatedEndTime={currentReading.estimated_arrival_time
                                    ? new Date(currentReading.estimated_arrival_time).getTime()
                                    : currentReading.timestamp}
                                onScrubChange={(newTime) => {
                                    setSelectedTime(newTime.getTime());
                                    // Find and display the reading closest to this time
                                    const closestReading = readings.reduce((prev, curr) => {
                                        return Math.abs(curr.timestamp - newTime.getTime()) < Math.abs(prev.timestamp - newTime.getTime())
                                            ? curr
                                            : prev;
                                    });
                                    setCurrentReading(closestReading);
                                }}
                                className="px-4 py-2"
                            />
                        )}
                        <div className="p-4">
                            <FlightDataDisplay reading={currentReading} />
                        </div>

                        {readings.length > 1 && (
                            <div className={`p-4 ${isExpanded ? 'grid grid-cols-2 gap-4 opacity-90' : 'space-y-4'}`}>
                                {METRICS_CONFIG.map(metricConfig => (
                                    <TimeSeriesGraph
                                        key={metricConfig.id}
                                        data={prepareGraphData(readings, metricConfig)}
                                        config={metricConfig}
                                        width={chartSize.width}
                                        height={chartSize.height}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <svg
                ref={svgRef}
                className="w-full h-full fixed top-0 left-0"
                style={{ backgroundColor: '#11D8E6' }}
            >
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>

                    {renderMapFeatures()}
                    {renderReadingHistory()}
                    {renderCurrentReading()}
                </g>
            </svg>

            <style jsx>{`
                @keyframes pulse {
                    0% {
                        r: 15;
                        opacity: 1;
                    }
                    100% {
                        r: 40;
                        opacity: 0;
                    }
                }
                .pulse-circle {
                    animation: pulse 2s infinite;
                }
            `}</style>
        </div>
    );
};

export default InteractiveWorldMap;