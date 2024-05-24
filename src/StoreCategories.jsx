import { createStore } from 'redux';

const initialState = {
  categoriesList: [],
  selectedCategories: []
};

function CategoriesReducer(state = initialState, action) {
    switch (action.type) {
      case 'ADD_CATEGORY':
        return { ...state, categoriesList: [...state.categoriesList, action.payload] };
      case 'CLEAR_CATEGORY':
        return { ...state, categoriesList: [] };
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