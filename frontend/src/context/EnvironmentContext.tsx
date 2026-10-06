import React, { createContext, useContext, useState } from 'react';

type EnvironmentType = 'all' | 'production' | 'staging' | 'development';

interface EnvironmentContextType {
  environment: EnvironmentType;
  setEnvironment: (env: EnvironmentType) => void;
}

const EnvironmentContext = createContext<EnvironmentContextType | undefined>(undefined);

export const EnvironmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [environment, setEnvironment] = useState<EnvironmentType>('all');

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
};

export const useEnvironment = () => {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironment must be used within an EnvironmentProvider');
  }
  return context;
};
