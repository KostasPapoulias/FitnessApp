import React, {useState} from 'react';

export default function Start({exe, workedMuscles, worked}){

    // const [Exersices, setExersices] = useState(Exercises);
    const [Exersices, setExersices] = useState(exe);
    const handleBegin = () => {
        // console.log(Exersices);

        let groups = Array.isArray(Exersices) ? Exersices.map(item => item.category) : [];
        
        workedMuscles(groups);
        worked(true);
        // workedMuscles(Exersices.map(item => item.group));
    }
    return(
        <div className="Start">
            <ChosenExercises ExersicesList={Exersices} />
            <div className="begin" onClick={handleBegin}>Start Exersice</div>
        </div>
    );
}

/**
 * 
 * @returns displayes the chosen exercises
 */
const ChosenExercises = ({ExersicesList}) => {
    console.log(ExersicesList);
    return(
        <div className='chosenExercises'>
            {ExersicesList && ExersicesList.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    <img className="im" src={item.image} alt={item.name} style={{width: '60px'}}/>
                    {item.name}
                </div>
            ))}
        </div>
    );
}

