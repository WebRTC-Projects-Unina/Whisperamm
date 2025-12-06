import { useContext } from 'react';
import { JanusContext } from '../context/JanusProvider';

export const useJanus = () => {
    const context = useContext(JanusContext);
    
    if (!context) {
        throw new Error('useJanus must be used within JanusProvider');
    }
    
    return context;
};