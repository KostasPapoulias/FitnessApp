import { createStore } from 'redux';

const initialState = {
  list: []
};

function ListReducer(state = initialState, action) {
    switch (action.type) {
      case 'ADD_ITEM':
      return { ...state, list: [...state.list, action.payload] };
      case 'CLEAR_LIST':
        return { ...state, list: [] };
      default:
        return state;
    }
  }

// const StoreExersices = createStore(ListReducer);

export default ListReducer;