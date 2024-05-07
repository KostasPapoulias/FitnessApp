import React, { useState } from 'react';
import './Date.css';


const DatePicker = () => {
    const [selectedDate1, setSelectedDate1] = useState(new Date());

    const initialDate2 = new Date();
    initialDate2.setDate(initialDate2.getDate() + 1);
    const [selectedDate2, setSelectedDate2] = useState(initialDate2);
    
    const initialDate3 = new Date();
    initialDate3.setDate(initialDate3.getDate() + 2);
    const [selectedDate3, setSelectedDate3] = useState(initialDate3);
    
    const initialDate4 = new Date();
    initialDate4.setDate(initialDate4.getDate() + 3);
    const [selectedDate4, setSelectedDate4] = useState(initialDate4);
    
    const initialDate5 = new Date();
    initialDate5.setDate(initialDate5.getDate() + 4);
    const [selectedDate5, setSelectedDate5] = useState(initialDate5);



  const handlePrevDay = () => {
    let prevDay = new Date(selectedDate1);
    prevDay.setDate(selectedDate1.getDate() - 1);
    setSelectedDate1(prevDay);
    prevDay = new Date(selectedDate2);
    prevDay.setDate(selectedDate2.getDate() - 1);
    setSelectedDate2(prevDay);
    prevDay = new Date(selectedDate3);
    prevDay.setDate(selectedDate3.getDate() - 1);
    setSelectedDate3(prevDay);
    prevDay = new Date(selectedDate4);
    prevDay.setDate(selectedDate4.getDate() - 1);
    setSelectedDate4(prevDay);
    prevDay = new Date(selectedDate5);
    prevDay.setDate(selectedDate5.getDate() - 1);
    setSelectedDate5(prevDay);
  };

  const handleNextDay = () => {
    let nextDay = new Date(selectedDate1);
    nextDay.setDate(selectedDate1.getDate() + 1);
    setSelectedDate1(nextDay);
    nextDay = new Date(selectedDate2);
    nextDay.setDate(selectedDate2.getDate() + 1);
    setSelectedDate2(nextDay);
    nextDay = new Date(selectedDate3);
    nextDay.setDate(selectedDate3.getDate() + 1);
    setSelectedDate3(nextDay);
    nextDay = new Date(selectedDate4);
    nextDay.setDate(selectedDate4.getDate() + 1);
    setSelectedDate4(nextDay);
    nextDay = new Date(selectedDate5);
    nextDay.setDate(selectedDate5.getDate() + 1);
    setSelectedDate5(nextDay);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
    });
  };


  const [clickedDate, setClickedDate] = useState(1);


  const handleClickDate = (index) => {
        setClickedDate(index);
    }

    return (
        <div className="date-picker">
            <button className='button' onClick={handlePrevDay}>&lt;</button>
            <div className={`selected-date ${clickedDate === 1 ? 'clicked' : ''}`} onClick={() => handleClickDate(1)}>
                {formatDate(selectedDate1)}
                <br />
                {selectedDate1.getDate()}
            </div>
            <div className={`selected-date ${clickedDate === 2 ? 'clicked' : ''}`} onClick={() => handleClickDate(2)}>
                {formatDate(selectedDate2)}
                <br />
                {selectedDate2.getDate()}
            </div>
            <div className={`selected-date ${clickedDate === 3 ? 'clicked' : ''}`} onClick={() => handleClickDate(3)}>
                {formatDate(selectedDate3)}
                <br />
                {selectedDate3.getDate()}
            </div>
            <div className={`selected-date ${clickedDate === 4 ? 'clicked' : ''}`} onClick={() => handleClickDate(4)}>
                {formatDate(selectedDate4)}
                <br />
                {selectedDate4.getDate()}
            </div>
            <div className={`selected-date ${clickedDate === 5 ? 'clicked' : ''}`} onClick={() => handleClickDate(5)}>
                {formatDate(selectedDate5)}
                <br />
                {selectedDate5.getDate()}
            </div>
            <button className='button' onClick={handleNextDay}>&gt;</button>
        </div>
    );
};

export default DatePicker;