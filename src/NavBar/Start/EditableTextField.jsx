import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import EditIcon from '@mui/icons-material/Edit';

const EditableTextField = () => {
  const [value, setValue] = useState('Editable text');
  const [editing, setEditing] = useState(false);

  const handleEditClick = () => {
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
  };

  const handleChange = (event) => {
    setValue(event.target.value);
  };

  return (
    <div>
      <label>First name</label>
      {editing ? (
        <TextField
          value={value}
          onChange={handleChange}
          autoFocus
          onBlur={handleSave}
        />
      ) : (
        <div>
          <span>{value}</span>
          <IconButton onClick={handleEditClick}>
            <EditIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
};

export default EditableTextField;
