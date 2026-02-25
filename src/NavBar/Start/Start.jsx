import React from 'react';
import './Start.css';
import WorkoutPanel from './WorkoutPanel';
import { useStartLogic } from '../logic/StartLogic';
import ChosenExercises from './components/ChosenExercises';

/**
 * The page will display the chosen exercises and will allow the user to start the workout
 * @returns the start of the workout page of the application 
 */
export default function Start() {
    const {
        hasStarted,
        isRunning,
        handleBegin,
        handleFinish,
    } = useStartLogic();

    return (
        <div className="Start">
            {hasStarted ? (
                <div className='Started'>
                    <WorkoutPanel onFinishPress={handleFinish} />
                </div>
            ) : (
                <div className='Default'>
                    <ChosenExercises />
                    <div className="begin" onClick={handleBegin}>Start Exersice</div>
                </div>
            )}
        </div>
    );
}