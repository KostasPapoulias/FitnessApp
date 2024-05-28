import React, { useState, useEffect } from 'react';

/**
 * 
 * @param {isRunning} param0 isRunning is a boolean that will determine if the timer is running or not
 * @returns the time in hours, minutes, and seconds
 */
const Timer = ({ isRunning }) => {
    const [time, setTime] = useState({hours: 0, minutes: 0, seconds: 0});

    useEffect(() => {
        let intervalId;
    
        if (isRunning) {
            intervalId = setInterval(() => {
                setTime(prevTime => {
                    const totalSeconds = prevTime.hours * 3600 + prevTime.minutes * 60 + prevTime.seconds + 1;
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
                    const seconds = totalSeconds - hours * 3600 - minutes * 60;
                    return {hours, minutes, seconds};
                });
            }, 1000);
        }
    
        return () => {
            clearInterval(intervalId);
        };
    }, [isRunning]);

    return (
        <div>
            {time.hours}:{time.minutes}:{time.seconds}
        </div>
    );
};

export default Timer;