import React, { Component } from "react";
import "./ToggleList.scss";

class ToggleList extends Component {
    constructor(props) {
        super(props);
        this.onClick = this.onClick.bind(this);
        this.state = {
            isExpanded: false
        };
    }

    onClick() {
        this.setState({
            isExpanded: !this.state.isExpanded
        });
    }

    render() {
        const defaultLength = this.props.defaultLength;
        const list = this.props.list;
        const tempSize =
            defaultLength > list.length ? list.length : defaultLength;
        const size = this.state.isExpanded ? list.length : tempSize;
        return (
            <ul
                className={`list--unstyled toggle-list ${this.props.className}`}
            >
                {list.slice(0, size).map((o) => (
                    <li key={this.props.getKey(o)}>
                        {this.props.renderFunction(o)}
                    </li>
                ))}
                {list.length - tempSize > 0 && (
                    <li>
                        <button
                            className="au-btn au-btn--tertiary"
                            onClick={this.onClick}
                        >
                            {this.state.isExpanded
                                ? `Show less`
                                : `+ Show ${list.length - tempSize} more`}
                        </button>
                    </li>
                )}
            </ul>
        );
    }
}

export default ToggleList;
