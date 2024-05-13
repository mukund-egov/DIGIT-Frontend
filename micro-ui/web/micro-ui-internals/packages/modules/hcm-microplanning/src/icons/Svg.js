export const PopulationSvg = (style) => {
  return `
        <svg width="50" height="50" viewBox="0 0 18 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 0C4.03714 0 0 4.082 0 9.1C0 15.925 9 26 9 26C9 26 18 15.925 18 9.1C18 4.082 13.9629 0 9 0Z" fill= ${
            style && style.fill ? '"' + style.fill + '"' : '"rgba(176, 176, 176, 1)"'
        };/>
        <g clip-path="url(#clip0_6283_43793)">
        <path d="M11 8.5C11.83 8.5 12.495 7.83 12.495 7C12.495 6.17 11.83 5.5 11 5.5C10.17 5.5 9.5 6.17 9.5 7C9.5 7.83 10.17 8.5 11 8.5ZM7 8.5C7.83 8.5 8.495 7.83 8.495 7C8.495 6.17 7.83 5.5 7 5.5C6.17 5.5 5.5 6.17 5.5 7C5.5 7.83 6.17 8.5 7 8.5ZM7 9.5C5.835 9.5 3.5 10.085 3.5 11.25V12.5H10.5V11.25C10.5 10.085 8.165 9.5 7 9.5ZM11 9.5C10.855 9.5 10.69 9.51 10.515 9.525C11.095 9.945 11.5 10.51 11.5 11.25V12.5H14.5V11.25C14.5 10.085 12.165 9.5 11 9.5Z" fill="white"/>
        </g>
        <defs>
        <clipPath id="clip0_6283_43793">
        <rect width="12" height="12" fill="white" transform="translate(3 3)"/>
        </clipPath>
        </defs>
        </svg>
    `;
};
