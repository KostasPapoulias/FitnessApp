
import { SvgLoader, SvgProxy } from "react-svgmt";
// import human1 from '../../../pictures/good_front_side.svg';
// import human2 from '../../../pictures/good_back_side.svg';
import human1 from '../../../pictures/front5.svg';
import human2 from '../../../pictures/back5.svg';
import flip from '../../../pictures/flip.png';
import { useSelector } from "react-redux";
import "./Human.css";

import { useEffect } from "react";

import { useState } from "react";
export default function Human({WoMuscles}){

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

    const recovery = useSelector(state => Array.isArray(state.categories.recovery) ? state.categories.recovery : []); 
    console.log(recovery);
    return(
        <div className='HumanContainer'>

                {isHuman1 ? (
                  <div className="human">
                     <SvgLoader path={human1}>
                     
                     <SvgProxy selector={"path"} fill="white" />
                     {recovery.map((element,index )=> 
                      element.count == 0 ? (
                        <SvgProxy
                          key={element.name + index}
                          selector={"#" + element.name + ",#" + element.name + " path"}
                          fill="white"
                        />
                      ) : element.count == 1 ? (
                        <SvgProxy
                          key={element.name + index}
                          selector={"#" + element.name + ",#" + element.name + " path"}
                          fill="pink"
                        />
                      ) : element.count == 2 ? (
                        <SvgProxy
                          key={element.name + index}
                          selector={"#" + element.name + ",#" + element.name + " path"}
                          fill="red"
                        />
                      ) : null
                    )}
                      
                   </SvgLoader>
                   </div>
                ) : (
                  <div className="human">
                  <SvgLoader path={human2}>
                  
                   <SvgProxy selector={"path"} fill="white" />
                    {recovery.map((element,index )=> 
                      element.count == 0 ? (
                        <SvgProxy
                          key={element.name + index}
                          selector={"#" + element.name + ",#" + element.name + " path"}
                          fill="white"
                        />
                      ) : element.count == 1 ? (
                        <SvgProxy
                          key={element.name + index}
                          selector={"#" + element.name + ",#" + element.name + " path"}
                          fill="pink"
                        />
                      ) : element.count == 2 ? (
                        <SvgProxy
                          key={element.name + index}
                          selector={"#" + element.name + ",#" + element.name + " path"}
                          fill="red"
                        />
                      ) : null
                    )}
                    
                </SvgLoader>
                </div>
                )}
                
                <button className='switchSide' onClick={handleClick}><img src={flip} alt="flip" style={{width: '50px'}}/></button>
            
          
        </div>
    );
}