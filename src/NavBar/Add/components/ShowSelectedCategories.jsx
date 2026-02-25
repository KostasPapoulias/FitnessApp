import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { toggleUp } from '../../../helpSlice';

/**
 * @param {returnCategorySelected} returnSelectedCategory category that has been selected
 * @returns a horizontal list of the arrays that have been chosen
 */
export default function ShowSelectedCategories({ categoriesArray, returnSelectedCategory }) {
    const dispatch = useDispatch();
    const categories = useSelector(state => Array.isArray(state.categories.categoriesList) ? state.categories.categoriesList : []);

    useEffect(() => {
        if (!categories.length) {
            dispatch(toggleUp('true'));
        }
    }, [categories, dispatch]);

    const [selection, setSelection] = useState(categoriesArray[0]);
    const handleSelection = (category) => {
        setSelection(prevSelection => category);
        returnSelectedCategory(prevSelection => category);
    };

    return (
        <div className='displayCateg'>
            {categories.map((category) => (
                <div key={category} className='categ' onClick={() => handleSelection(category)}>
                    <div style={{ fontFamily: "Copperplate, Fantasy" }}>{category}</div>
                    <img src={'../../../../pictures/traps_files/' + category + '.png'} alt={category} style={{ width: '80px' }} />
                </div>
            ))}
        </div>
    );
}
