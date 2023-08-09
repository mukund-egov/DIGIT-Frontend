import React from "react";
import useRouteSubscription from "../utils/useRouteSubscription";
import { getUser } from "../utils/getUser";
import PropTypes from "prop-types";

const Card = ({ onClick, style = {}, children, className = "", ReactRef, pathname, ...props }) => {
  const classname = useRouteSubscription(pathname) || "";
  const info = getUser()?.info || null;
  const userType = info?.type || null;
  const isEmployee = classname === "employee" || userType === "EMPLOYEE";

  return (
    <div
      className={`${props?.noCardStyle ? "" : isEmployee ? "digit-employee-card" : "digit-card"} ${className ? className : ""}`}
      onClick={onClick}
      style={style}
      {...props}
      ref={ReactRef}
    >
      {children}
    </div>
  );
};

Card.propTypes = {
  onClick: PropTypes.func,
  style: PropTypes.object,
  className: PropTypes.string,
  children: PropTypes.node,
};
export default Card;
