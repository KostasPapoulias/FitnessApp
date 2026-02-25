import React from 'react';
import './Add.css';
import { AddCategoryMenu } from './AddCategoryMenu';
import { useAddLogic } from '../logic/AddLogic';
import TopPart from './components/TopPart';
import DisplayDefault from './components/DisplayDefault';
import ShowSelectedCategories from './components/ShowSelectedCategories';

export default function Add({ Exersices, onListChange, saveDate }) {
    const {
        topNew,
        topReturn,
        chosenCategories,
        returnCategorySelected,
        handleTopReturn,
        handleChosenCategories,
        handleTopNew,
        handleReturnSelectedCategory,
    } = useAddLogic(Exersices, onListChange, saveDate);

    return (
        <div className='Add'>
            {topNew ? <AddCategoryMenu goBack={handleTopReturn}
                chosenCategories={handleChosenCategories} />
                : <TopPart topNew={handleTopNew} />}
            {!topNew ? <DisplayDefault selectedCategory={returnCategorySelected} /> : <></>}
            {!topNew && <ShowSelectedCategories categoriesArray={chosenCategories} returnSelectedCategory={handleReturnSelectedCategory} />}
        </div>
    );
}