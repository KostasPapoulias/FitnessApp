
import { SvgLoader, SvgProxy } from "react-svgmt";
import human1 from '../../../pictures/good_front_side.svg';
import human2 from '../../../pictures/good_back_side.svg';
import flip from '../../../pictures/flip.png';

import { useEffect } from "react";

import { useState } from "react";
export default function Test({WoMuscles}){

    const [muscles, setMuscles] = useState([]);
    const uniqueMuscles = [...new Set(muscles)];

    useEffect(() => {
      console.log("workedMuscles: ", WoMuscles);
      if (Array.isArray(WoMuscles)) {
        console.log("workedMuscles: ", WoMuscles);
          setMuscles(prevMuscles => [...prevMuscles, ...WoMuscles]);
      }
    }, [WoMuscles]);


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

    return(
        <div className='HumanContainer'>

                {isHuman1 ? (
                     <SvgLoader path={human1}>
                     {/* Important! this proxy will reset the color to black,
                       otherwise old elements would still be shown in red
                       because this library doesn't store previous states */}
                     <SvgProxy selector={"path"} fill="white" />
                     {uniqueMuscles.map(code => (
                       <SvgProxy
                         key={code}
                         selector={"#" + code + ",#" + code + " path"}
                         fill="red"
                       />
                     ))}
                   </SvgLoader>
                     
                ) : (
                  <SvgLoader path={human2}>
                  {/* Important! this proxy will reset the color to black,
                    otherwise old elements would still be shown in red
                    because this library doesn't store previous states */}
                  <SvgProxy selector={"path"} fill="white" />
                  {uniqueMuscles.map(code => (
                    <SvgProxy
                      key={code}
                      selector={"#" + code + ",#" + code + " path"}
                      fill="red"
                    />
                  ))}
                </SvgLoader>
                )}
                <button className='switchSide' onClick={handleClick}><img src={flip} alt="flip" style={{width: '50px'}}/></button>
            
          
        </div>
    );
}