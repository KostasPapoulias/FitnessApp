import { createStore } from 'redux';

const initialState = {
  help : ['true'],
  toggleUp: ['true'],
  toggleDown: ['true'],
};

function HelpReducer(state = initialState, action) {
    switch (action.type) {
      case 'ADD_HELP':
        return { ...state, help: [action.payload] };
      case 'DELETE_HELP':
        return { ...state, help: [action.payload] };
      case 'TOGGLE_UP':
        return { ...state, toggleUp: [action.payload] };
      case 'TOGGLE_DOWN':
        return { ...state, toggleDown: [action.payload] };
    default:
        return state;
    }
}
export default HelpReducer;