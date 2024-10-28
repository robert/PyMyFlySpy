import { useCallback, useEffect, useRef, useState } from 'react';

const FlightScrubber = ({
    currentTime,
    startTime,
    estimatedEndTime,
    onScrubChange,
    className = ''
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [progress, setProgress] = useState(0);
    const scrubberRef = useRef(null);

    // Validate timestamps and calculate duration
    const validStartTime = startTime ? new Date(startTime).getTime() : null;
    const validEndTime = estimatedEndTime ? new Date(estimatedEndTime).getTime() : null;
    const validCurrentTime = currentTime ? new Date(currentTime).getTime() : null;

    // Only proceed if we have valid times
    const totalDuration = validStartTime && validEndTime ? validEndTime - validStartTime : 0;

    // Update progress when currentTime changes
    useEffect(() => {
        if (!isDragging && validCurrentTime && validStartTime && totalDuration > 0) {
            const elapsed = validCurrentTime - validStartTime;
            const newProgress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
            setProgress(newProgress);
        }
    }, [validCurrentTime, validStartTime, totalDuration, isDragging]);

    // Handle mouse/touch events for scrubbing
    const handleScrub = useCallback((clientX) => {
        if (!validStartTime || !totalDuration || !scrubberRef.current) return;

        const rect = scrubberRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
        const newProgress = (x / rect.width) * 100;
        setProgress(newProgress);

        // Calculate new time based on progress
        const newTime = validStartTime + (totalDuration * (newProgress / 100));
        onScrubChange(new Date(newTime));
    }, [validStartTime, totalDuration, onScrubChange]);

    const handleMouseDown = (e) => {
        if (!validStartTime || !totalDuration) return;
        setIsDragging(true);
        handleScrub(e.clientX);
    };

    const handleMouseMove = useCallback((e) => {
        if (isDragging) {
            handleScrub(e.clientX);
        }
    }, [isDragging, handleScrub]);

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Format time for tooltip
    const formatTime = (timestamp) => {
        if (!timestamp) return '--:--';
        try {
            return new Date(timestamp).toLocaleTimeString();
        } catch (e) {
            return '--:--';
        }
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove]);

    // Don't render if we don't have valid times
    if (!validStartTime || !validEndTime || totalDuration <= 0) {
        return null;
    }

    return (
        <div className={`relative ${className}`}>
            {/* Time labels */}
            <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{formatTime(validStartTime)}</span>
                <span>{formatTime(validEndTime)}</span>
            </div>

            {/* Scrubber bar */}
            <div
                ref={scrubberRef}
                className="relative h-2 bg-gray-200 rounded-full cursor-pointer"
                onMouseDown={handleMouseDown}
            >
                {/* Progress bar */}
                <div
                    className="absolute h-full bg-blue-500 rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                />

                {/* Scrubber handle */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow transform -translate-x-1/2 transition-all duration-150 ${isDragging ? 'scale-125' : ''}`}
                    style={{ left: `${progress}%` }}
                >
                    {/* Time tooltip */}
                    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
                        {formatTime(validStartTime + (totalDuration * (progress / 100)))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FlightScrubber;