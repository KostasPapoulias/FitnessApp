import React from 'react';
import { useState } from 'react';

/**
 * this function is a button with animations
 * @param {AddPressed} param0 called when the button is pressed
 * @returns a button with animations
 */

export default function ButtonAdd({AddPressed}){
    const [isButtonClicked, setButtonClicked] = useState(false);

    const handleClick = () => {
        setButtonClicked(true);
        AddPressed();
        setTimeout(() => setButtonClicked(false), 600);
    };

    return (
        <button 
        style={{ 
            backgroundImage: isButtonClicked ? 'linear-gradient(270deg, #b2b2b2, red)' : 'linear-gradient(270deg, #b2b2b2, #b2b2b2)',
            backgroundSize: '200% 1%',
            backgroundPosition: isButtonClicked ? '0 0' : '100% 0',
            transition: 'background-position .5s',
            color: 'black',
            border: '0.1px solid red',
            borderRadius: '5px'
        }}
            onClick={handleClick}
        >
            Add
        </button>
    );
};

