
import { SvgLoader, SvgProxy } from "react-svgmt";
// import human1 from '../../../pictures/good_front_side.svg';
// import human2 from '../../../pictures/good_back_side.svg';
import human1 from '../../../pictures/front5.svg';
import human2 from '../../../pictures/back5.svg';
import flip from '../../../pictures/flip.png';
import { useSelector } from "react-redux";
import "./Human.css";
import { useState } from "react";


/**
 * Manipulates the SVG image according to which exersices and category has been worked out
 * An once trained muscle category colorized with pink and a two in a row trained colorized with red, else white
 * In trained round, muscle category upgrades by 1 until 2
 * In non trained round, muscle category downgrades by 1 until 0
 * @returns one of two images displaying human according at flip button state
 */
export default function Human(){


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