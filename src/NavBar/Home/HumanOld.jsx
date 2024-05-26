import React, { useState } from 'react';
import human1 from '../../../pictures/human1.png';
import human2 from '../../../pictures/human2.png';
import './Human.css'
import flip from '../../../pictures/flip.png';

const Human = () => {
    const [isHuman1, setIsHuman1] = useState(true);

    const handleSwitchImage = () => {
        setIsHuman1(!isHuman1);
    };
    
    const [isSideA, setSideA] = useState(true);

    const handleSwitchSide = () => {
        setSideA(!isSideA);
    };

    const handleClick = () => {
        handleSwitchImage();
        handleSwitchSide();
    };

    return (
        <div className='HumanContainer'>

        {isSideA ? (
            <div className='sideA'>
                <div className='shoudlersContainer'>
                <div className='shoulders'>Shoudlers</div>
                <div className='shO1'></div>
                <div className='shO2'></div>
                <div className='shV'></div>
            </div>
            <div className='chestContainer'>
            <div className='chest'>Chest</div>
                <div className='chO1'></div>
                <div className='chO2'></div>
                <div className='chV'></div>
            </div>
            <div className='bicepsContainer'>
                <div className='biceps'>Biceps</div>
                <div className='biO1'></div>
                <div className='biO2'></div>
                <div className='biV'></div>
            </div>
            <div className='tricepsContainer'>
                <div className='triceps'>Triceps</div>
                <div className='trO1'></div>
                <div className='trO2'></div>
                <div className='trV'></div>
            </div>
            <div className='forearmsContainer'>
                <div className='forearms'>Forearms</div>
                <div className='foO1'></div>
                <div className='foO2'></div>
                <div className='foV'></div>
            </div>
            <div className='absContainer'>
                <div className='abs'>Abs</div>
                <div className='abO1'></div>
                <div className='abO2'></div>
                <div className='abV'></div>
            </div>
            <div className='quadsContainer'>
                <div className='quads'>Quads</div>
                <div className='quO1'></div>
                <div className='quO2'></div>
                <div className='quV'></div>
            </div>
            </div>
        ) : (
            <div className='sideB'>
                <div className='hamstringsContainer'>
                    <div className='hamstrings'>Hamstrings</div>
                    <div className='haO1'></div>
                    <div className='haO2'></div>
                    <div className='haV'></div>
                </div>
                <div className='glutesContainer'>
                    <div className='glutes'>Glutes</div>
                    <div className='glO1'></div>
                    <div className='glO2'></div>
                    <div className='glV'></div>
                </div>
                <div className='backContainer'>
                    <div className='back'>Back</div>
                    <div className='baO1'></div>
                    <div className='baO2'></div>
                    <div className='baV'></div>
                </div>
                <div className='latsContainer'>
                    <div className='lats'>Lats</div>
                    <div className='laO1'></div>
                    <div className='laO2'></div>
                    <div className='laV'></div>
                </div>
                <div className='trapsContainer'>
                    <div className='traps'>Traps</div>
                    <div className='traO1'></div>
                    <div className='traO2'></div>
                    <div className='traV'></div>
                </div>
                <div className='calvesContainer'>
                    <div className='calves'>Calves</div>
                    <div className='caO1'></div>
                    <div className='caO2'></div>
                    <div className='caV'></div>
                </div>
            </div>
        )}

            
            <div className='human'>
                {isHuman1 ? (
                    <img src={human1} alt="Human 1" />
                ) : (
                    <img src={human2} alt="Human 2" />
                )}
                <button className='switchSide' onClick={handleClick}><img src={flip} alt="flip" style={{width: '50px'}}/></button>
            </div>
        </div>
    );
};

export {Human};