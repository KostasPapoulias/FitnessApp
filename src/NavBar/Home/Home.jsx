import './Home.css';
import * as React from 'react';
import DatePicker from '../Date';
import Human from './Human';
import { useHomeLogic } from '../logic/HomeLogic';

export default function Home() {
    const { homeDate, handleDate } = useHomeLogic();

    return (
        <div className="Home">
            {/* <Human /> */}
            <Human />
        </div>
    );
}