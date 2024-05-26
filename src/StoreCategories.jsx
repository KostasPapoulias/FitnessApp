import { Category } from '@mui/icons-material';
import { createStore } from 'redux';

const initialState = {
  categoriesList: [],
  recovery: [{name: 'Triceps', count:0},
            {name: 'Biceps', count:0},
            {name: 'Chest', count:0},
            {name: 'Shoulders', count:0},
            {name: 'Abs', count:0},
            {name: 'Traps', count:0},
            {name: 'Lats', count:0},
            {name: 'Calves', count:0},
            {name: 'Quads', count:0},
            {name: 'Glutes', count:0},
            {name: 'Hamstrings', count:0},
            {name: 'Forearms', count:0},
  ] ,
};

function CategoriesReducer(state = initialState, action) {
    switch (action.type) {
      case 'ADD_CATEGORY':
        return { ...state, categoriesList: [...state.categoriesList, action.payload] };
      case 'CLEAR_CATEGORY':
        return { ...state, categoriesList: [] };
      case 'INCREMENT_CATEGORY_COUNT':
        return {
          ...state,
          recovery: state.recovery.map(category =>
            category.name === action.payload && category.count < 2
              ? { ...category, count: category.count + 1 }
              : category
          )
        };  
      case 'DECREMENT_CATEGORY_COUNT':
        return {
          ...state,
          recovery: state.recovery.map(category =>
            category.name === action.payload && category.count > 0
              ? { ...category, count: category.count - 1 }
              : category
          )
      };
      case 'ADD_SELECTED_CATEGORY':
        return { ...state, selectedCategories: [...state.selectedCategories, action.payload] };
        case 'CLEAR_SELECTED_CATEGORY':
        return { ...state, selectedCategories: [] };    
    default:
        return state;
    }
  }

// const StoreCategories = createStore(CategoriesReducer);

export default CategoriesReducer;