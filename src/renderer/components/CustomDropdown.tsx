import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FaMusic, FaSearch, FaChevronDown, FaSpotify, FaApple, FaYoutube } from 'react-icons/fa';
import { AnimatePresence, motion } from 'framer-motion';

interface Option {
  id: string;
  name: string;
  artwork?: string | null;
}

interface CustomDropdownProps {
  options: Option[];
  value: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  serviceHint?: 'spotify' | 'apple' | 'youtube';
  usePortal?: boolean; // render menu in a fixed portal (avoids clipping)
  menuMinWidth?: number; // minimum menu width (px) when using portal
  menuMaxHeight?: number; // override max height (px)
}

function getServiceIcon(name: string, hint?: 'spotify' | 'apple' | 'youtube') {
  if (hint === 'spotify') return <FaSpotify color="#1DB954" />;
  if (hint === 'apple') return <FaApple color="#fff" />;
  if (hint === 'youtube') return <FaYoutube color="#ff0000" />;
  if (/spotify/i.test(name)) return <FaSpotify color="#1DB954" />;
  if (/apple/i.test(name)) return <FaApple color="#fff" />;
  if (/youtube/i.test(name)) return <FaYoutube color="#ff0000" />;
  return <FaMusic />;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  options,
  value,
  onSelect,
  placeholder = 'Select an option',
  disabled = false,
  serviceHint,
  usePortal = false,
  menuMinWidth,
  menuMaxHeight = 520,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 0 });
  const positionUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedOption = useMemo(() => {
    if (value === null || value === undefined) return undefined;
    return options.find(opt => opt.id === value);
  }, [options, value]);

  // Debounce search term to reduce filtering frequency
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 150); // 150ms debounce
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const filteredOptions = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return options;
    const term = debouncedSearchTerm.toLowerCase();
    return options.filter(option =>
      option.name && option.name.toLowerCase().includes(term)
    );
  }, [options, debouncedSearchTerm]);

  // Optimized portal menu position calculation with debouncing
  const updateMenuPosition = useCallback(() => {
    if (!dropdownRef.current) return;
    
    // Clear any pending updates
    if (positionUpdateTimeoutRef.current) {
      clearTimeout(positionUpdateTimeoutRef.current);
    }
    
    // Debounce position updates to avoid excessive calculations
    positionUpdateTimeoutRef.current = setTimeout(() => {
      if (!dropdownRef.current) return;
      
      const rect = dropdownRef.current.getBoundingClientRect();
      const desiredMin = typeof menuMinWidth === 'number' ? menuMinWidth : 0;
      const width = Math.max(rect.width, desiredMin || 0);
      const margin = 10;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const preferred = (typeof menuMaxHeight === 'number' && menuMaxHeight > 0) ? menuMaxHeight : 520;
      const maxHeight = Math.max(200, Math.min(preferred, spaceBelow));
      let left = rect.left;
      if (left + width + 10 > window.innerWidth) left = Math.max(10, window.innerWidth - width - 10);
      const top = rect.bottom + 6;
      setMenuPos({ top, left, width, maxHeight });
      if (menuRef.current) menuRef.current.style.maxHeight = `${maxHeight}px`;
    }, 16); // ~60fps
  }, [menuMinWidth, menuMaxHeight]);

  // Optimized dropdown height adjustment with throttled event listeners
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;
    
    if (usePortal) {
      updateMenuPosition();
      
      // Throttled event handlers to reduce performance impact
      let scrollTimeout: NodeJS.Timeout | null = null;
      let resizeTimeout: NodeJS.Timeout | null = null;
      
      const throttledScroll = () => {
        if (scrollTimeout) return;
        scrollTimeout = setTimeout(() => {
          updateMenuPosition();
          scrollTimeout = null;
        }, 16);
      };
      
      const throttledResize = () => {
        if (resizeTimeout) return;
        resizeTimeout = setTimeout(() => {
          updateMenuPosition();
          resizeTimeout = null;
        }, 16);
      };
      
      window.addEventListener('scroll', throttledScroll, { passive: true });
      window.addEventListener('resize', throttledResize, { passive: true });
      
      return () => {
        window.removeEventListener('scroll', throttledScroll);
        window.removeEventListener('resize', throttledResize);
        if (scrollTimeout) clearTimeout(scrollTimeout);
        if (resizeTimeout) clearTimeout(resizeTimeout);
        if (positionUpdateTimeoutRef.current) clearTimeout(positionUpdateTimeoutRef.current);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      };
    } else if (dropdownRef.current && menuRef.current) {
      const triggerRect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const margin = 20;
      const preferred = (typeof menuMaxHeight === 'number' && menuMaxHeight > 0) ? menuMaxHeight : 520;
      const maxHeight = Math.max(160, Math.min(preferred, spaceBelow - margin));
      menuRef.current.style.maxHeight = `${maxHeight}px`;
    }
  }, [isOpen, menuMaxHeight, updateMenuPosition, usePortal]);


  // Close dropdown when clicking outside (account for portal menu)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = dropdownRef.current ? dropdownRef.current.contains(target) : false;
      const inMenu = menuRef.current ? menuRef.current.contains(target) : false;
      if (!inTrigger && !inMenu) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((option: Option) => {
    onSelect(option.id);
    setIsOpen(false);
    setSearchTerm('');
  }, [onSelect]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (positionUpdateTimeoutRef.current) clearTimeout(positionUpdateTimeoutRef.current);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  return (
    <div className={`custom-dropdown ${disabled ? 'disabled' : ''}`} ref={dropdownRef}>
      <button type="button" className="dropdown-trigger" onClick={() => !disabled && setIsOpen(!isOpen)}>
        <div className="trigger-content">
          {selectedOption ? (
            <>
              <div className="dropdown-item-artwork small">
                {selectedOption.artwork === undefined ? (
                  // For the trigger, prefer the actual selected option
                  // but fall back to hint only when we cannot infer from name
                  (/spotify/i.test(selectedOption.name) || /apple/i.test(selectedOption.name) || /youtube/i.test(selectedOption.name))
                    ? getServiceIcon(selectedOption.name)
                    : getServiceIcon(selectedOption.name, serviceHint)
                ) : selectedOption.artwork ? (
                  <img src={selectedOption.artwork} alt={selectedOption.name} onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <FaMusic />
                )}
              </div>
              <span className="dropdown-item-name">{selectedOption.name}</span>
            </>
          ) : (
            <span className="placeholder">{placeholder}</span>
          )}
        </div>
        <FaChevronDown className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="dropdown-menu"
            ref={menuRef}
            style={usePortal ? { position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight, zIndex: 10000 } : undefined}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="dropdown-search-container">
              <FaSearch className="search-icon" />
              <input
                type="text"
                className="dropdown-search-input"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            <ul className="dropdown-list">
              <AnimatePresence mode="wait">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <motion.li
                      key={option.id}
                      className="dropdown-item"
                      onClick={() => handleSelect(option)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1, ease: 'easeOut' }}
                    >
                      <div className="dropdown-item-artwork">
                        {option.artwork === undefined ? (
                          // For menu options, always derive icon from the option itself,
                          // not from the current selection hint
                          getServiceIcon(option.name)
                        ) : option.artwork ? (
                          <img src={option.artwork} alt={option.name} onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <FaMusic />
                        )}
                      </div>
                      <span className="dropdown-item-name">{option.name}</span>
                    </motion.li>
                  ))
                ) : (
                  <motion.li
                    className="dropdown-item-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >No options found.</motion.li>
                )}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomDropdown;
