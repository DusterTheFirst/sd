/*!
 * Copyright (C) 2018-2020  Zachary Kohnen (DusterTheFirst)
 */

import JSZip from "jszip";
import { toJS } from "mobx";
import { useObserver } from "mobx-react-lite";
import React, { MouseEvent, PropsWithChildren, useContext } from "react";
import { contextMenu, Item, Menu, Separator } from "react-contexify";
import { IsRenderingContext, RenderedCardsContext } from "../App";
import CardGroup from "../card/cardGroup";
import { GlobalStateContext, Selection, SelectionType } from "../state";
import { DangerItem } from "../styles/contextMenu";
import { downloadSelection } from "../util/file";
import { IItemArgs, ItemHandler } from "./Explorer";

/** Props to the better menu provider component */
interface IBMPProps {
    /** The id of the context menu */
    id: string;
    /** The selection that the menu should act upon */
    selection: Selection;
}

/** A better menu provider */
export function BetterMenuProvider({ id, children, selection }: PropsWithChildren<IBMPProps>) {
    const rightClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        event.persist();

        contextMenu.hideAll();
        setTimeout(() => contextMenu.show({
            event,
            id,
            props: selection
        }), 1);
    };

    const leftClick = (_: MouseEvent) => {
        contextMenu.hideAll();
    };

    return (
        <div onContextMenu={rightClick} onClick={leftClick}>
            {children}
        </div>
    );
}

/** Props for the Explorer context menus */
interface IECMProps {
    /** State changer for delete selection */
    setDeleteSelection(val: Selection): void;
}

/** The context menus for the explorer */
export function ExplorerContextMenus({ setDeleteSelection }: IECMProps) {
    const state = useContext(GlobalStateContext);
    const renderedCards = useContext(RenderedCardsContext);
    const [, setIsRendering] = useContext(IsRenderingContext);

    return useObserver(() => {
        const downloadClick = (({ props }: IItemArgs) => {
            if (props.type === SelectionType.Group) {
                const group = state.groups[props.group];

                downloadSelection({ type: SelectionType.Group, data: group.data }, `${group.name}.group.json`);
            } else if (props.type === SelectionType.Card) {
                const card = state.groups[props.group].cards[props.card];

                downloadSelection({ type: SelectionType.Card, data: card }, `${card.name}.card.json`);
            } else {
                downloadSelection({ type: SelectionType.None, data: toJS(state.groupsData) }, `workspace.json`);
            }
        }) as unknown as ItemHandler;

        const addClick = (({ props }: IItemArgs) => {
            if (props.type === SelectionType.Group) {
                const id = state.groups[props.group].addCard();
                state.select(props.group, id);
            } else if (props.type === SelectionType.None) {
                const id = state.addGroup(new CardGroup(`New Group ${state.groups.length}`));
                state.select(id);
            }
        }) as unknown as ItemHandler;

        const editClick = (({ props }: IItemArgs) => {
            if (props.type === SelectionType.Group) {
                state.select(props.group);
            }
        }) as unknown as ItemHandler;

        const editDisable = (({ props }: IItemArgs) => {
            // Disable the edit button if this card is already selected
            return props.type === SelectionType.Group && state.selection.type === SelectionType.Group && state.selection.group === props.group;
        }) as unknown as ItemHandler<boolean>;

        const deleteClick = (({ props }: IItemArgs) => setDeleteSelection(props)) as unknown as ItemHandler;

        const duplicateClick = (({ props }: IItemArgs) => {
            if (props.type === SelectionType.Group) {
                const id = state.addGroup(state.groups[props.group]);

                state.select(id);
            } else if (props.type === SelectionType.Card) {
                const group = state.groups[props.group];
                const id = group.addCard(group.rawCards[props.card]);

                state.select(props.group, id);
            }
        }) as unknown as ItemHandler;

        const upClick = (({ props }: IItemArgs) => {
            if (props.type === SelectionType.Group) {
                state.moveGroup(props.group, props.group - 1);
                state.select(props.group - 1);
            } else if (props.type === SelectionType.Card) {
                state.groups[props.group].moveCard(props.card, props.card - 1);
                state.select(props.group, props.card - 1);
            }
        }) as unknown as ItemHandler;

        const downClick = (({ props }: IItemArgs) => {
            if (props.type === SelectionType.Group) {
                state.moveGroup(props.group, props.group + 1);
                state.select(props.group + 1);
            } else if (props.type === SelectionType.Card) {
                state.groups[props.group].moveCard(props.card, props.card + 1);
                state.select(props.group, props.card + 1);
            }
        }) as unknown as ItemHandler;

        const upDisable = (({ props }: IItemArgs): boolean => {
            if (props.type === SelectionType.Group) {
                return props.group === 0;
            } else if (props.type === SelectionType.Card) {
                return props.card === 0;
            } else {
                return true;
            }
        }) as unknown as ItemHandler<boolean>;

        const downDisable = (({ props }: IItemArgs): boolean => {
            if (props.type === SelectionType.Group) {
                return props.group === state.groups.length - 1;
            } else if (props.type === SelectionType.Card) {
                return props.card === state.groups[props.group].cards.length - 1;
            } else {
                return true;
            }
        }) as unknown as ItemHandler<boolean>;

        const deselect = () => {
            state.select();
        };

        const renderClick = (async ({ props }: IItemArgs) => {
            if (renderedCards.current === null) {
                return;
            }

            setIsRendering(true);

            if (props.type === SelectionType.Group) {
                // Save the previous selection
                const preselect = state.selection;

                // Create zip file
                const render = new JSZip();

                for (let card = 0; card < state.groups[props.group].cards.length; card++) {
                    // Select and render the current card
                    state.select(props.group, card);

                    // Render and export the cards into a new zip file
                    await renderedCards.current.render(render.folder(state.groups[props.group].cards[card].name));
                }

                // Save the zip file
                saveAs(await render.generateAsync({ type: "blob" }), state.groups[props.group].name);

                // Return selection
                state.setSelection(preselect);
            } else if (props.type === SelectionType.Card) {
                // Save the previous selection
                const preselect = state.selection;

                // Select and render the current card
                state.select(props.group, props.card);

                // Render and export the cards into a new zip file
                const render = await renderedCards.current.render();

                // Save the zip file
                saveAs(await render.generateAsync({ type: "blob" }), state.groups[props.group].cards[props.card].name);

                // Return selection
                state.setSelection(preselect);
            } else {
                // Save the previous selection
                const preselect = state.selection;

                // Create zip file
                const render = new JSZip();

                for (let group = 0; group < state.groups.length; group++) {
                    const groupFolder = render.folder(state.groups[group].name);

                    for (let card = 0; card < state.groups[group].cards.length; card++) {
                        // Select and render the current card
                        state.select(group, card);

                        // Render and export the cards into a new zip file
                        await renderedCards.current.render(groupFolder.folder(state.groups[group].cards[card].name));
                    }
                }

                // Save the zip file
                saveAs(await render.generateAsync({ type: "blob" }), "workspace");

                // Return selection
                state.setSelection(preselect);
            }

            setIsRendering(false);
        }) as unknown as ItemHandler;

        return (
            <>
                <Menu id="none-contextmenu">
                    <Item onClick={addClick}>Add Group</Item>
                    <Separator />
                    <Item onClick={deselect}>Deselect All</Item>
                    <Separator />
                    <Item onClick={downloadClick}>Download All</Item>
                    <Item onClick={renderClick}>Render All</Item>
                    <Item disabled={true}>Print All</Item>
                </Menu>
                <Menu id="group-contextmenu">
                    <Item onClick={editClick} disabled={editDisable}>Edit</Item>
                    <Item onClick={addClick}>Add Card</Item>
                    <Item onClick={duplicateClick}>Duplicate</Item>
                    <Separator />
                    <Item onClick={upClick} disabled={upDisable}>Move Up</Item>
                    <Item onClick={downClick} disabled={downDisable}>Move Down</Item>
                    <Separator />
                    <Item onClick={downloadClick}>Download Group</Item>
                    <Item onClick={renderClick}>Render Group</Item>
                    <Item disabled={true}>Print Group</Item>
                    <Separator />
                    <DangerItem onClick={deleteClick}>Delete</DangerItem>
                </Menu>
                <Menu id="card-contextmenu">
                    <Item onClick={duplicateClick}>Duplicate</Item>
                    <Separator />
                    <Item onClick={upClick} disabled={upDisable}>Move Up</Item>
                    <Item onClick={downClick} disabled={downDisable}>Move Down</Item>
                    <Separator />
                    <Item onClick={downloadClick}>Download Card</Item>
                    <Item onClick={renderClick}>Render Card</Item>
                    <Item disabled={true}>Print Card</Item>
                    <Separator />
                    <DangerItem onClick={deleteClick}>Delete</DangerItem>
                </Menu>
            </>
        );
    });
}