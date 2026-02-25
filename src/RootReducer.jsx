import { combineReducers } from 'redux';
import exercisesReducer from './StoreExersices';
import categoriesReducer from './StoreCategories';
import helpReducer from './StoreHelp';

const RootReducer = combineReducers({
  exercises: exercisesReducer,
  categories: categoriesReducer,
  help: helpReducer,
});

export default RootReducer;