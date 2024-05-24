import { combineReducers } from 'redux';
import exercisesReducer from './StoreExersices';
import categoriesReducer from './StoreCategories';

const RootReducer = combineReducers({
  exercises: exercisesReducer,
  categories: categoriesReducer,
});

export default RootReducer;