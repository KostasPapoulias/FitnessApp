// Logic for Start component
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { clearList } from '../../exercisesSlice';
import { clearCategory, incrementCategoryCount, decrementCategoryCount } from '../../categoriesSlice';

export function useStartLogic() {
    const dispatch = useDispatch();
    const list = useSelector(state => state.exercises.list);
    const recovery = useSelector(state => state.categories.recovery);
    const [hasStarted, setHasStarted] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    const handleBegin = () => {
        if (list.length > 0) {
            setHasStarted(!hasStarted);
            setIsRunning(!isRunning);
        }
    };

    const handleFinish = (executedExersices) => {
        setHasStarted(!hasStarted);
        setIsRunning(!isRunning);
        let workedCategories = Array.isArray(executedExersices) ? executedExersices.map(item => item.category) : [];
        recovery.forEach(recovery => {
            const match = workedCategories.some(item => item === recovery.name);
            match ?
                dispatch(incrementCategoryCount(recovery.name))
                :
                dispatch(decrementCategoryCount(recovery.name))
        });
        dispatch(clearList());
        dispatch(clearCategory());
    };

    return {
        hasStarted,
        isRunning,
        handleBegin,
        handleFinish,
        list,
    };
}
