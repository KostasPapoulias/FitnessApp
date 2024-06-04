import { createStore } from 'redux';

const initialState = {
  list: []
};

function ListReducer(state = initialState, action) {
    switch (action.type) {
      case 'ADD_ITEM':
        return { ...state, list: [...state.list, action.payload] };
      case 'REMOVE_ITEM':
        return {
          ...state,
          list: state.list.filter(item => item.id !== action.payload.id),
        };      
      case 'CLEAR_LIST':
        return { ...state, list: [] };
      case 'UPDATE_LIST':
        return { ...state, list: state.list.filter(exercise => exercise.id !== action.payload.id) };
      case 'UPDATE_EXERCISE':
        return { ...state, list: state.list.map((exercise) => 
          (exercise.id === action.payload.id ? action.payload : exercise)) 
        };
      default:
        return state;
    }
  }

// const StoreExersices = createStore(ListReducer);

export default ListReducer;