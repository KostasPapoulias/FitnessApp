import React, {useState} from 'react';

export default function Start({exe}){

    // const [Exersices, setExersices] = useState(Exercises);
    const [Exersices, setExersices] = useState(exe);
    const handleClick = () => {
        console.log(Exersices);
    }
    return(
        <div className="Start">
            <ChosenExercises ExersicesList={Exersices} />
            <div className="begin" onClick={handleClick}>Start Exersice</div>
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

