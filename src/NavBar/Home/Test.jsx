
import { SvgLoader, SvgProxy } from "react-svgmt";
import human from '../../../pictures/good_front_side.svg';
import { useEffect } from "react";

import { useState } from "react";
export default function Test({WoMuscles}){

    const [muscles, setMuscles] = useState([]);

    useEffect(() => {
      console.log("workedMuscles: ", WoMuscles);
      if (Array.isArray(WoMuscles)) {
        console.log("workedMuscles: ", WoMuscles);
          setMuscles(prevMuscles => [...prevMuscles, ...WoMuscles]);
      }
    }, [WoMuscles]);

    return(
        <div className='HumanContainer'>
            <SvgLoader path={human}>
        {/* Important! this proxy will reset the color to black,
          otherwise old elements would still be shown in red
          because this library doesn't store previous states */}
        <SvgProxy selector={"path"} fill="white" />
        {muscles.map(code => (
          <SvgProxy
            key={code}
            selector={"#" + code + ",#" + code + " path"}
            fill="red"
          />
        ))}
      </SvgLoader>
        </div>
    );
}